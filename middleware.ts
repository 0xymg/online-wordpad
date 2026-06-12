import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Authenticated users landing on the root (e.g. after Google OAuth) → send to /pad.
  // getSessionCookie reads the cookie correctly in every environment, including the
  // "__Secure-" prefix used over HTTPS in production (the old hardcoded name missed it).
  if (pathname === "/") {
    const sessionCookie = getSessionCookie(request);
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/pad", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
