import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Authenticated users landing on the root (e.g. after Google OAuth) → send to /pad
  if (pathname === "/") {
    const session = request.cookies.get("better-auth.session_token");
    if (session) {
      return NextResponse.redirect(new URL("/pad", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/"],
};
