import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Config } from "../config";
import {
  ProviderRefusalError,
  REPLY_JSON_SCHEMA,
  type CompletionRequest,
  type CompletionResult,
  type LlmProvider,
} from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

export class AnthropicProvider implements LlmProvider {
  readonly name = "anthropic";
  readonly generative = true;
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_ANTHROPIC_MODEL,
    timeoutMs = 25000,
  ) {
    // Retries are handled by the SDK for 408/409/429/5xx and connection errors.
    this.client = new Anthropic({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        // Support replies are short and latency-sensitive.
        output_config: {
          effort: "low",
          ...(request.json ? { format: { type: "json_schema", schema: REPLY_JSON_SCHEMA } } : {}),
        },
        // If a safety classifier declines, let the API retry on its recommended fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: request.signal },
    );
    if (response.stop_reason === "refusal") throw new ProviderRefusalError();
    const text = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("")
      .trim();
    if (response.stop_reason === "max_tokens" && request.json) {
      throw new Error("The model reply was cut off before it finished");
    }
    return {
      text,
      inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
    };
  }
}

export class OpenAIProvider implements LlmProvider {
  readonly name = "openai";
  readonly generative = true;
  private readonly client: OpenAI;

  constructor(
    apiKey: string,
    readonly model: string,
    timeoutMs = 25000,
  ) {
    this.client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 1 });
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const response = await this.client.chat.completions.create(
      {
        model: this.model,
        max_completion_tokens: request.maxTokens,
        messages: [
          { role: "system", content: request.system },
          { role: "user", content: request.prompt },
        ],
        ...(request.json
          ? {
              response_format: {
                type: "json_schema" as const,
                json_schema: { name: "support_reply", strict: true, schema: { ...REPLY_JSON_SCHEMA } },
              },
            }
          : {}),
      },
      { signal: request.signal },
    );
    const choice = response.choices[0];
    if (!choice) throw new Error("The model returned no choices");
    if (choice.message.refusal) throw new ProviderRefusalError(choice.message.refusal);
    if (choice.finish_reason === "length" && request.json) {
      throw new Error("The model reply was cut off before it finished");
    }
    return {
      text: (choice.message.content ?? "").trim(),
      inputTokens: response.usage?.prompt_tokens ?? 0,
      outputTokens: response.usage?.completion_tokens ?? 0,
    };
  }
}

/**
 * No language model. Replies are assembled from the best-matching knowledge-base passage
 * by the assistant itself, and summaries are unavailable. Lets the product work without
 * an AI key while being explicit about what it is doing.
 */
export class ExtractiveProvider implements LlmProvider {
  readonly name = "extractive";
  readonly model = null;
  readonly generative = false;
  complete(): Promise<CompletionResult> {
    return Promise.reject(new Error("The extractive provider does not generate text"));
  }
}

export class DisabledProvider implements LlmProvider {
  readonly name = "none";
  readonly model = null;
  readonly generative = false;
  complete(): Promise<CompletionResult> {
    return Promise.reject(new Error("AI is disabled on this server"));
  }
}

export function createProvider(config: Config): LlmProvider {
  switch (config.aiProvider) {
    case "anthropic":
      return new AnthropicProvider(
        config.ANTHROPIC_API_KEY ?? "",
        config.AI_MODEL ?? DEFAULT_ANTHROPIC_MODEL,
        config.AI_TIMEOUT_MS,
      );
    case "openai":
      if (!config.AI_MODEL) throw new Error("AI_MODEL is required for AI_PROVIDER=openai");
      return new OpenAIProvider(config.OPENAI_API_KEY ?? "", config.AI_MODEL, config.AI_TIMEOUT_MS);
    case "extractive":
      return new ExtractiveProvider();
    case "none":
      return new DisabledProvider();
  }
}
