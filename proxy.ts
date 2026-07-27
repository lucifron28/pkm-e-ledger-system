import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const token = request.cookies.get("pkm_session")?.value;
  const { pathname } = request.nextUrl;

  const isPublicPath =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon.ico");

  // Redirect unauthenticated users requesting protected routes to login
  if (!token && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users visiting login or register to portal root
  if (token && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/ledger/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/admin/:path*",
    "/audit-log/:path*",
    "/osa/:path*",
    "/account/:path*",
    "/change-password/:path*",
    "/login",
    "/register",
  ],
};
