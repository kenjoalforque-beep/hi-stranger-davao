import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const queue_id = body?.queue_id;

  if (!isUuid(queue_id)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { error } = await admin
    .from("queue")
    .update({ active: false })
    .eq("id", queue_id);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
