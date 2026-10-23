import { DurableObject } from "cloudflare:workers";
import postgres from "postgres";
import type { RealtimeEvent, WidgetEvent } from "@supportflow/shared";
import type { RealtimePublisher } from "./bus";

const MEMBERSHIP_RECHECK_MS = 60_000;

export interface HubEnv {
  HYPERDRIVE: Hyperdrive;
  REALTIME: DurableObjectNamespace<RealtimeHub>;
}

/** Stored on each socket so it survives hibernation. */
export type HubAttachment = { kind: "org"; u: string; o: string; n: string; e: number } | { kind: "visitor" };

const HUB_ORIGIN = "https://realtime-hub.internal";

/**
 * Realtime fan-out on Cloudflare Workers. One instance per channel (`org:<id>` or
 * `visitor:<conversationId>`), so every socket of a channel lives in the same place.
 * Sockets use the hibernation API: an idle channel costs nothing while it waits.
 *
 * The Worker entry authenticates each socket before forwarding it here; the hub only
 * enforces single-use tickets and re-checks dashboard memberships once a minute.
 */
export class RealtimeHub extends DurableObject<HubEnv> {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/publish" && request.method === "POST") {
      const message = await request.text();
      for (const socket of this.ctx.getWebSockets()) {
        try {
          socket.send(message);
        } catch {
          // The socket closed while we were sending; its close handler cleans up.
        }
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname === "/connect" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const attachment = JSON.parse(request.headers.get("x-hub-attachment") ?? "null") as HubAttachment | null;
      if (!attachment) return new Response("Bad request", { status: 400 });
      if (attachment.kind === "org") {
        const key = `nonce:${attachment.n}`;
        if (await this.ctx.storage.get(key)) return rejectSocket(4401, "invalid ticket");
        await this.ctx.storage.put(key, attachment.e);
        await this.ensureAlarm();
      }
      const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(attachment);
      if (attachment.kind === "org") server.send(JSON.stringify({ type: "ready" }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Not found", { status: 404 });
  }

  override webSocketMessage(): void {
    // Receive-only: clients send messages over HTTPS.
  }

  override webSocketClose(socket: WebSocket, code: number, reason: string): void {
    try {
      socket.close(code, reason);
    } catch {
      // Already closed.
    }
  }

  override async alarm(): Promise<void> {
    const now = Date.now();
    const nonces = await this.ctx.storage.list<number>({ prefix: "nonce:" });
    const expired = [...nonces].filter(([, expires]) => expires < now).map(([key]) => key);
    if (expired.length > 0) await this.ctx.storage.delete(expired);

    const orgSockets = this.ctx
      .getWebSockets()
      .map((socket) => ({ socket, attachment: socket.deserializeAttachment() as HubAttachment | null }))
      .filter((s): s is { socket: WebSocket; attachment: Extract<HubAttachment, { kind: "org" }> } => s.attachment?.kind === "org");
    if (orgSockets.length > 0) await this.closeRevoked(orgSockets);

    if (orgSockets.length > 0 || nonces.size > expired.length) await this.ctx.storage.setAlarm(now + MEMBERSHIP_RECHECK_MS);
  }

  /** Closes dashboard sockets whose user has been removed from the workspace. */
  private async closeRevoked(sockets: { socket: WebSocket; attachment: { u: string; o: string } }[]) {
    const orgId = sockets[0]!.attachment.o;
    const sql = postgres(this.env.HYPERDRIVE.connectionString, { max: 1, fetch_types: false, onnotice: () => {} });
    try {
      // Workspaces are small, so reading all members is simpler than passing an array parameter.
      const rows = await sql<{ user_id: string }[]>`select user_id::text from memberships where org_id = ${orgId}::uuid`;
      const active = new Set(rows.map((r) => r.user_id));
      for (const { socket, attachment } of sockets) {
        if (!active.has(attachment.u)) socket.close(4403, "membership revoked");
      }
    } catch (error) {
      console.warn("Realtime membership check failed", error);
    } finally {
      await sql.end({ timeout: 5 });
    }
  }

  private async ensureAlarm() {
    if ((await this.ctx.storage.getAlarm()) === null) await this.ctx.storage.setAlarm(Date.now() + MEMBERSHIP_RECHECK_MS);
  }
}

/** Forwards an authenticated WebSocket upgrade to the channel's hub. */
export function connectToHub(env: HubEnv, channel: string, attachment: HubAttachment): Promise<Response> {
  const stub = env.REALTIME.get(env.REALTIME.idFromName(channel));
  return stub.fetch(`${HUB_ORIGIN}/connect`, {
    headers: { upgrade: "websocket", "x-hub-attachment": JSON.stringify(attachment) },
  });
}

/** Completes the handshake and closes at once, so the client sees the same close codes as on Node. */
export function rejectSocket(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

/** Publishes events to hubs. Sends are tracked so the Worker keeps running until they finish. */
export class HubPublisher implements RealtimePublisher {
  constructor(
    private readonly env: HubEnv,
    private readonly track: (label: string, send: () => Promise<unknown>) => void,
  ) {}

  publishOrg(orgId: string, event: RealtimeEvent): void {
    this.send(`org:${orgId}`, event);
  }

  publishVisitor(conversationId: string, event: WidgetEvent): void {
    this.send(`visitor:${conversationId}`, event);
  }

  private send(channel: string, event: RealtimeEvent | WidgetEvent) {
    this.track("realtime publish", async () => {
      const stub = this.env.REALTIME.get(this.env.REALTIME.idFromName(channel));
      const response = await stub.fetch(`${HUB_ORIGIN}/publish`, { method: "POST", body: JSON.stringify(event) });
      await response.body?.cancel();
    });
  }
}
