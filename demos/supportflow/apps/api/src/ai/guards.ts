/**
 * Deterministic safeguards applied around the model. They do not rely on the model
 * following instructions, so they still hold if a customer message or a knowledge-base
 * passage tries to inject new instructions.
 */

export interface SensitiveIntent {
  category: "refund" | "billing" | "account" | "legal" | "security";
  reason: string;
}

const SENSITIVE_PATTERNS: { category: SensitiveIntent["category"]; pattern: RegExp; reason: string }[] = [
  {
    category: "refund",
    pattern: /\b(refund|reimburs|money back|chargeback|charge ?back|compensat)/i,
    reason: "Customer is asking about a refund or compensation",
  },
  {
    category: "billing",
    pattern: /\b(cancel (my )?(subscription|plan|order|account)|double charged|charged twice|overcharged|invoice dispute|payment failed)/i,
    reason: "Customer is asking for a billing or order change",
  },
  {
    category: "account",
    pattern: /\b(delete my (account|data)|close my account|change (my )?(email|password|address)|reset (my )?password|transfer (my )?account|gdpr|erase my)/i,
    reason: "Customer is asking for an account change or data request",
  },
  {
    category: "legal",
    pattern: /\b(lawyer|legal action|sue|lawsuit|attorney|court)\b/i,
    reason: "Customer mentions legal action",
  },
  {
    category: "security",
    pattern: /\b(hacked|fraud|stolen|unauthori[sz]ed (charge|access|login)|phishing)\b/i,
    reason: "Customer reports a security or fraud issue",
  },
];

export function detectSensitiveIntent(text: string): SensitiveIntent | null {
  for (const { category, pattern, reason } of SENSITIVE_PATTERNS) {
    if (pattern.test(text)) return { category, reason };
  }
  return null;
}

/** Explicit requests for a person. */
export function asksForHuman(text: string): boolean {
  return /\b(human|real person|agent|representative|someone (from|on) (your|the) team|talk to (a )?person|speak (to|with) (a )?(person|someone|manager))\b/i.test(
    text,
  );
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"')\]]+/gi;

/**
 * Links in a reply must already appear in the retrieved sources. A link the model made
 * up (or was told to insert by injected text) would otherwise reach the customer.
 */
export function findUnsupportedLinks(reply: string, sourceTexts: string[]): string[] {
  const allowed = sourceTexts.join("\n").toLowerCase();
  const links = reply.match(URL_PATTERN) ?? [];
  return links.filter((link) => !allowed.includes(link.toLowerCase().replace(/[.,;:!?]+$/, "")));
}

/**
 * Commitments the assistant must not make on its own: refunds, credits, cancellations or
 * account changes "done" by the AI. Phrases like "I've refunded" are blocked even when the
 * knowledge base mentions refunds.
 */
export function makesUnauthorizedCommitment(reply: string): boolean {
  return /\b(i('| ha)ve|we('| ha)ve|i will|i'll|we will|we'll)\s+(now\s+)?(issued?|processed?|refunded|cancel(l)?ed|credited|deleted|changed|reset|upgraded|downgraded|waived|approved)\b/i.test(
    reply,
  ) || /\b(guarantee|promise)\b/i.test(reply);
}

/** Escapes text placed inside the prompt's XML-like data sections. */
export function escapeForPrompt(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
