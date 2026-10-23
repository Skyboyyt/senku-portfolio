import { NextResponse, type NextRequest } from "next/server";

/**
 * Sends signed-out visitors from the dashboard to the sign-in page. This is only a
 * convenience: every API request is authorized by the API itself.
 */
export function proxy(request: NextRequest) {
  if (!request.cookies.has("sf_session")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/app", "/app/:path*"] };
