import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the SupportFlow API. It keeps the session cookie first-party (the
 * browser only ever talks to this domain) and passes the visitor's IP to the API with a
 * shared secret so rate limits apply per person rather than per proxy.
 */
const API = (process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
const SECRET = process.env.PROXY_SHARED_SECRET;
/** Set to the one header the host itself writes (cf-connecting-ip on Cloudflare); clients can't forge it there. */
const CLIENT_IP_HEADER = process.env.CLIENT_IP_HEADER?.toLowerCase();

const FORWARD_REQUEST_HEADERS = ["cookie", "content-type", "origin", "user-agent", "accept", "stripe-signature"];
const FORWARD_RESPONSE_HEADERS = ["content-type", "cache-control", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"];

async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  // Encode each segment so a crafted path can't escape to another host or route prefix.
  const target = `${API}/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`;

  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (SECRET) {
    headers.set("x-sf-proxy-secret", SECRET);
    const ip = CLIENT_IP_HEADER
      ? request.headers.get(CLIENT_IP_HEADER)
      : (request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim());
    if (ip) headers.set("x-sf-client-ip", ip);
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return Response.json(
      { error: { code: "api_unreachable", message: "The SupportFlow service is unavailable. Try again shortly." } },
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  for (const name of FORWARD_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) responseHeaders.append("set-cookie", cookie);
  return new Response(upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: responseHeaders });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
export const dynamic = "force-dynamic";
