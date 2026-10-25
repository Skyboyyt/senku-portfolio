import { next } from '@vercel/functions';

const UPSTREAM = 'https://learnspace-skyboy.calm-crumb-7736.chatgpt.site';
const ANALYTICS_SCRIPT = '<script defer src="/_vercel/insights/script.js"></script>';

// Leave analytics endpoints, Next.js assets, and sign-in callbacks to Vercel's
// existing routing. Only document navigations should be transformed.
export const config = {
  matcher: ['/((?!_vercel/|_next/|favicon.ico|signin-with-chatgpt|signout-with-chatgpt|callback).*)'],
};

export default async function middleware(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const accept = request.headers.get('accept') ?? '';

  if (
    request.method !== 'GET' ||
    !accept.includes('text/html') ||
    request.headers.has('rsc') ||
    request.headers.has('next-router-prefetch') ||
    url.searchParams.has('_rsc') ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/account/') ||
    url.pathname.startsWith('/settings/') ||
    url.pathname.startsWith('/profile/')
  ) {
    return next();
  }

  const upstreamUrl = new URL(url.pathname + url.search, UPSTREAM);
  const headers = new Headers(request.headers);
  for (const name of ['host', 'connection', 'accept-encoding', 'content-length', 'x-forwarded-host', 'x-forwarded-proto']) {
    headers.delete(name);
  }

  try {
    const response = await fetch(upstreamUrl, { headers, redirect: 'manual' });
    if (response.status !== 200 || !(response.headers.get('content-type') ?? '').includes('text/html')) {
      return next();
    }
    const original = await response.text();
    if (!original.includes('</head>')) return next();
    const html = original.includes('/_vercel/insights/script.js')
      ? original
      : original.replace(/<\/head>/i, ANALYTICS_SCRIPT + '</head>');
    const responseHeaders = new Headers(response.headers);
    for (const name of ['content-length', 'content-encoding', 'etag', 'last-modified', 'transfer-encoding']) {
      responseHeaders.delete(name);
    }
    return new Response(html, { status: 200, headers: responseHeaders });
  } catch {
    // A tracking error must never block the underlying Learnspace app.
    return next();
  }
}
