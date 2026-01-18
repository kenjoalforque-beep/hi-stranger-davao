import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

function philippineDateISO() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const user_token = body?.user_token;

  if (!isUuid(user_token)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const night_date = philippineDateISO();
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("night_limits")
    .select("self_end_count")
    .eq("user_token", user_token)
    .eq("night_date", night_date)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", details: error.message }, { status: 500 });
  }

  const count = Number(data?.self_end_count ?? 0);
  const left = Math.max(0, 2 - count);

  return NextResponse.json({ ok: true, self_end_count: count, ends_left: left, night_date });
}
