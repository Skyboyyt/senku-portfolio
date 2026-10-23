import { EventEmitter } from "node:events";
import type { RealtimeEvent, WidgetEvent } from "@supportflow/shared";

/**
 * Publishes realtime updates. Channels are scoped by tenant: dashboard sockets listen on
 * `org:<orgId>`, widget sockets on `visitor:<conversationId>`.
 *
 * Two implementations: `RealtimeBus` (in-process, for the Node server) and the Durable
 * Object publisher used on Cloudflare Workers (`realtime/hub.ts`).
 */
export interface RealtimePublisher {
  publishOrg(orgId: string, event: RealtimeEvent): void;
  publishVisitor(conversationId: string, event: WidgetEvent): void;
}

/** In-process bus for a single Node instance. Also used by the tests. */
export class RealtimeBus implements RealtimePublisher {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publishOrg(orgId: string, event: RealtimeEvent): void {
    this.emitter.emit(`org:${orgId}`, event);
  }

  publishVisitor(conversationId: string, event: WidgetEvent): void {
    this.emitter.emit(`visitor:${conversationId}`, event);
  }

  subscribeOrg(orgId: string, listener: (event: RealtimeEvent) => void): () => void {
    const channel = `org:${orgId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }

  subscribeVisitor(conversationId: string, listener: (event: WidgetEvent) => void): () => void {
    const channel = `visitor:${conversationId}`;
    this.emitter.on(channel, listener);
    return () => this.emitter.off(channel, listener);
  }
}
