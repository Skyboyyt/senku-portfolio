import type { z } from "zod";
import { fromZod, notFound } from "./errors";

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data ?? {});
  if (!result.success) throw fromZod(result.error);
  return result.data;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a route `:id` param. Malformed IDs are reported as not found. */
export function idParam(params: unknown, key = "id", what = "Record"): string {
  const value = (params as Record<string, unknown> | undefined)?.[key];
  if (typeof value !== "string" || !UUID.test(value)) throw notFound(what);
  return value.toLowerCase();
}
