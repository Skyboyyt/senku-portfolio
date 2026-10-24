import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter((p) => /^\p{L}/u.test(p));
  if (parts.length === 0) return "?";
  return (parts[0]![0]! + (parts.length > 1 ? parts.at(-1)![0]! : "")).toUpperCase();
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "short" });

/** "just now", "5 min ago", "yesterday", or a date for anything older than a week. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000;
  const abs = Math.abs(diff);
  if (abs < 45) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(iso);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

export function customerLabel(c: { name: string | null; email: string | null }): string {
  return c.name || c.email || "Website visitor";
}
