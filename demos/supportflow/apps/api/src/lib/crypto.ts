import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client";

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/*
 * Passwords are hashed with bcrypt (cost 11) by PostgreSQL's pgcrypto extension.
 * Doing the work in the database keeps it off the API's CPU budget, which matters on
 * Cloudflare Workers. The password is SHA-256 hashed first so bcrypt's 72-byte input
 * limit never silently truncates a long password.
 */
const BCRYPT_COST = 11;

export async function hashPassword(db: DbOrTx, password: string): Promise<string> {
  const rows = await db.execute<{ h: string }>(
    sql`select crypt(${sha256(password)}, gen_salt('bf', ${BCRYPT_COST})) as h`,
  );
  const hash = rows[0]?.h;
  if (!hash) throw new Error("Password hashing failed");
  return hash;
}

export async function verifyPassword(db: DbOrTx, stored: string, password: string): Promise<boolean> {
  if (!stored.startsWith("$2")) return false;
  const rows = await db.execute<{ ok: boolean }>(sql`select crypt(${sha256(password)}, ${stored}) = ${stored} as ok`);
  return rows[0]?.ok === true;
}

/** A real bcrypt hash, so checking an unknown email takes as long as a real one. */
const DUMMY_HASH = "$2a$11$0M3SNKRybTKwBY5OiNSUdOf0irc2vEgm7m.O46lVlXntbS3mdeisK";
export function getDummyHash(): string {
  return DUMMY_HASH;
}
