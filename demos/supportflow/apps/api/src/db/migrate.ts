import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Applies pending SQL migrations from ./drizzle. Safe to run on every deploy. */
export async function runMigrations(url: string): Promise<void> {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // Works from src/db (tsx) and from dist (bundled build).
  const candidates = [path.resolve(here, "../../drizzle"), path.resolve(here, "../drizzle")];
  const { existsSync } = await import("node:fs");
  const migrationsFolder = candidates.find((p) => existsSync(path.join(p, "meta")));
  if (!migrationsFolder) throw new Error("Could not find the drizzle migrations folder");
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log("Migrations applied");
    })
    .catch((error: unknown) => {
      console.error(error);
      process.exit(1);
    });
}
