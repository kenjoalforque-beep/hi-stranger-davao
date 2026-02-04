import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const room_id = body?.room_id;

  if (!isUuid(room_id)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Update last_msg_at + increment message_count
  const { error } = await admin.rpc("room_message_ping", { p_room_id: room_id });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", details: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
