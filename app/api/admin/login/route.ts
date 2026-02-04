import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_dash";

export async function POST(req: Request) {
  const expected = process.env.ADMIN_DASH_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "missing_server_token" },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => null);
  const token = String(body?.token || "").trim();

  if (!token || token !== expected) {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set(COOKIE_NAME, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return res;
}
