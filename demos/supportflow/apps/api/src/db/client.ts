import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A database handle or an open transaction. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

export interface DbHandle {
  db: Database;
  sql: postgres.Sql;
  close: () => Promise<void>;
}

export function createDb(url: string, max = 10): DbHandle {
  const sql = postgres(url, {
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    // Neon and most hosted Postgres require TLS; postgres.js reads sslmode from the URL.
    onnotice: () => {},
  });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, sql, close: () => sql.end({ timeout: 5 }) };
}

export { schema };
