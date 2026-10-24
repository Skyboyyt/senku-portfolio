import { createHmac } from "node:crypto";
import { safeEqual } from "../lib/crypto";

/**
 * Verifies a `Stripe-Signature` header (scheme v1: HMAC-SHA256 of "<timestamp>.<raw body>").
 * Rejects stale timestamps to prevent replay.
 */
export function verifyStripeSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (!key || !value) continue;
    if (key.trim() === "t") timestamp = Number(value);
    if (key.trim() === "v1") signatures.push(value.trim());
  }
  if (timestamp === null || !Number.isFinite(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;
  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return signatures.some((sig) => safeEqual(sig, expected));
}

export function signStripePayload(rawBody: string, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const sig = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  return `t=${timestamp},v1=${sig}`;
}
