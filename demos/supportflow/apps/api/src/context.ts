import type { FastifyBaseLogger } from "fastify";
import type { AiAssistant } from "./ai/assistant";
import type { BillingService } from "./billing/service";
import type { Config } from "./config";
import type { Database } from "./db/client";
import type { RealtimePublisher } from "./realtime/bus";

/** Tracks fire-and-forget work (AI replies) so tests and shutdown can wait for it. */
export class TaskTracker {
  private readonly pending = new Set<Promise<unknown>>();

  constructor(private readonly log: FastifyBaseLogger) {}

  run(label: string, fn: () => Promise<unknown>): void {
    const promise = fn()
      .catch((error: unknown) => this.log.error({ err: error, task: label }, "Background task failed"))
      .finally(() => this.pending.delete(promise));
    this.pending.add(promise);
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}

export interface AppContext {
  config: Config;
  /** On Cloudflare Workers this is a per-request connection; always read it from ctx. */
  readonly db: Database;
  bus: RealtimePublisher;
  ai: AiAssistant;
  billing: BillingService;
  tasks: TaskTracker;
  log: FastifyBaseLogger;
}
