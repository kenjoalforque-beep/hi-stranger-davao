import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only protect admin routes
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const expected = process.env.ADMIN_DASH_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "admin_token_not_configured" },
      { status: 500 }
    );
  }

  const token =
    req.cookies.get("admin_dash_token")?.value ||
    req.headers.get("x-admin-token") ||
    req.nextUrl.searchParams.get("token");

  if (token !== expected) {
    // If it's a page request, send to home
    if (isAdminPage) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    // If it's an API request, return JSON
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

// IMPORTANT: only run middleware for these paths
export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
