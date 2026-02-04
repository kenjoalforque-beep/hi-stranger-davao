import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_dash";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard admin surfaces
  const isAdminPage = pathname.startsWith("/admin");
  const isAdminApi = pathname.startsWith("/api/admin");

  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  // Allow the login endpoints/pages without auth
  if (pathname === "/admin/login") return NextResponse.next();
  if (pathname === "/api/admin/login") return NextResponse.next();

  // Check cookie
  const authed = req.cookies.get(COOKIE_NAME)?.value === "1";
  if (authed) return NextResponse.next();

  // If API -> 401 JSON
  if (isAdminApi) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // If page -> redirect to login
  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
