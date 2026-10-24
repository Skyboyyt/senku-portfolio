import { buildApp } from "./app";
import { loadConfig } from "./config";
import { runMaintenance } from "./services/retention";

const config = loadConfig();
const app = await buildApp({ config });

let maintenance: NodeJS.Timeout | null = null;
if (config.JOBS_ENABLED) {
  const run = () =>
    runMaintenance(app.ctx.db, config.DEMO_RETENTION_HOURS)
      .then((result) => app.log.info(result, "Maintenance finished"))
      .catch((error: unknown) => app.log.error({ err: error }, "Maintenance failed"));
  maintenance = setInterval(run, 60 * 60_000);
  setTimeout(run, 30_000).unref();
}

const shutdown = async (signal: string) => {
  app.log.info({ signal }, "Shutting down");
  if (maintenance) clearInterval(maintenance);
  await app.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ host: config.HOST, port: config.PORT });
app.log.info(
  { ai: app.ctx.ai.provider.name, model: app.ctx.ai.provider.model, billing: config.BILLING_MODE },
  "SupportFlow API ready",
);
