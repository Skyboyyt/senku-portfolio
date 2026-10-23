import postgres from "postgres";
import { runMigrations } from "../src/db/migrate";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/supportflow_test";

/** Recreates the test schema. Refuses to touch any database whose name doesn't end in _test. */
export default async function setup(): Promise<void> {
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to reset "${name}": the test database name must end with _test`);
  }
  const sql = postgres(TEST_DATABASE_URL, { max: 1, onnotice: () => {} });
  try {
    await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  } finally {
    await sql.end();
  }
  await runMigrations(TEST_DATABASE_URL);
}
