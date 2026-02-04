import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Protects:
 * - /admin/*
 * - /api/admin/*
 *
 * Auth method: header "x-admin-token" must match process.env.ADMIN_DASH_TOKEN
 */
export function middleware(req: NextRequest) {
  const token = req.headers.get("x-admin-token") || "";
  const expected = process.env.ADMIN_DASH_TOKEN || "";

  // If token missing/incorrect, block.
  // For /api routes -> return 401 JSON
  // For /admin pages -> redirect to /
  const isApi = req.nextUrl.pathname.startsWith("/api/admin");

  if (!expected || token !== expected) {
    if (isApi) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("forbidden", "1");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
