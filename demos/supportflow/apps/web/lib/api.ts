import type { ApiErrorBody } from "@supportflow/shared";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Calls the API through the web app's same-origin /api proxy, so the session cookie is
 * first-party. Throws ApiError with field messages for validation failures.
 */
export async function api<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: init.method ?? (init.body !== undefined ? "POST" : "GET"),
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error", "Can't reach SupportFlow. Check your connection and try again.");
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  const data = text ? (safeParse(text) as unknown) : undefined;
  if (!response.ok) {
    const body = data as Partial<ApiErrorBody> | undefined;
    throw new ApiError(
      response.status,
      body?.error?.code ?? "error",
      body?.error?.message ?? `Request failed (${response.status})`,
      body?.error?.fields ?? {},
    );
  }
  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** SWR fetcher bound to the API client. */
export const fetcher = <T,>(path: string) => api<T>(path);

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}
