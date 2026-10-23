import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

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

// OWASP-recommended argon2id parameters (19 MiB, 2 iterations).
const ARGON_OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

/** A real hash used to keep login timing similar when the email doesn't exist. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomToken(16));
  return dummyHash;
}
