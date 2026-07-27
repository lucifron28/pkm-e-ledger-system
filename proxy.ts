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

  if (!token && !isPublicPath) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
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
