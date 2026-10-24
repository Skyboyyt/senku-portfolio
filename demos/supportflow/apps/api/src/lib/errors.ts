import type { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, fields?: Record<string, string>) =>
  new AppError(400, "bad_request", message, fields);
export const unauthorized = (message = "Sign in to continue") =>
  new AppError(401, "unauthorized", message);
export const forbidden = (message = "You don't have permission to do that") =>
  new AppError(403, "forbidden", message);
/** Used for records outside the caller's workspace too, so IDs can't be probed. */
export const notFound = (what = "Record") => new AppError(404, "not_found", `${what} not found`);
export const conflict = (message: string, fields?: Record<string, string>) =>
  new AppError(409, "conflict", message, fields);
export const planLimit = (message: string) => new AppError(402, "plan_limit", message);
export const unavailable = (message: string) => new AppError(503, "unavailable", message);

export function fromZod(error: ZodError): AppError {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!fields[key]) fields[key] = issue.message;
  }
  const first = error.issues[0]?.message ?? "Invalid request";
  return new AppError(400, "validation_error", first, fields);
}

/** True for a Postgres unique-constraint violation, including when wrapped by Drizzle. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 3 && current; depth++) {
    if (typeof current === "object" && "code" in current && (current as { code: unknown }).code === "23505") {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
