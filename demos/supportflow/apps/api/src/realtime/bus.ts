import { EventEmitter } from "node:events";
import type { RealtimeEvent, WidgetEvent } from "@supportflow/shared";

/**
 * In-process pub/sub for realtime updates.
 *
 * Channels are scoped by tenant: dashboard sockets subscribe to `org:<orgId>`, widget
 * sockets to `visitor:<conversationId>`. A single API instance is assumed; to run several,
 * replace this with Postgres LISTEN/NOTIFY or Redis behind the same interface.
 */
export class RealtimeBus {
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

  listenerCount(): number {
    return this.emitter.eventNames().reduce((n, e) => n + this.emitter.listenerCount(e), 0);
  }
}
