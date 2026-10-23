export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
export const DEMO_WIDGET_KEY = process.env.NEXT_PUBLIC_DEMO_WIDGET_KEY ?? "";
