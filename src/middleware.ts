import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

// Protect authenticated app routes. The session cookie is HttpOnly and
// verified with firebase-admin in API routes / server components.
// Middleware only checks presence (cheap); validity is verified server-side.
const PROTECTED = [/^\/app/, /^\/settings/, /^\/profile/];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PROTECTED.some((re) => re.test(pathname))) {
    const session = req.cookies.get(process.env.SESSION_COOKIE_NAME || "rush_session");
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/settings/:path*", "/profile/:path*"],
};
