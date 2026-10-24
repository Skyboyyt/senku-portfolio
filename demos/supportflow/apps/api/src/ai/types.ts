/** JSON schema the model must follow for support replies. */
export const REPLY_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "confidence", "needs_human", "reason", "source_ids"],
  properties: {
    reply: { type: "string", description: "The message to send to the customer." },
    confidence: {
      type: "number",
      description: "0 to 1. How fully the knowledge base supports this reply.",
    },
    needs_human: {
      type: "boolean",
      description: "True when a person on the support team should handle this.",
    },
    reason: { type: "string", description: "Short internal note for the support team." },
    source_ids: {
      type: "array",
      items: { type: "integer" },
      description: "IDs of the knowledge-base sources the reply relies on.",
    },
  },
} as const;

export interface CompletionRequest {
  system: string;
  /** A single user turn: untrusted content is wrapped in data tags inside it. */
  prompt: string;
  maxTokens: number;
  /** Ask for JSON matching REPLY_JSON_SCHEMA. */
  json: boolean;
  signal: AbortSignal;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

/** Thrown when the model declines a request (for example a safety refusal). */
export class ProviderRefusalError extends Error {
  constructor(message = "The model declined to answer") {
    super(message);
    this.name = "ProviderRefusalError";
  }
}

export interface LlmProvider {
  /** Stable identifier recorded in usage rows: anthropic, openai, workers-ai, extractive, none. */
  readonly name: string;
  readonly model: string | null;
  /** False for providers that cannot write free text (extractive, none). */
  readonly generative: boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
