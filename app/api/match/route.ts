import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { canMatchNow, isWithinOpenHour } from "@/lib/time";

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

export async function POST(req: Request) {
  // In production, enforce matching window
  if (process.env.NODE_ENV !== "development") {
    if (!isWithinOpenHour() || !canMatchNow()) {
      return NextResponse.json({ ok: false, error: "matching_closed" }, { status: 403 });
    }
  }

  const body = await req.json().catch(() => null);
  const queue_id = body?.queue_id;

  if (!isUuid(queue_id)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Call DB function. It returns ONE row: { room_id: uuid | null }
  const { data, error } = await admin.rpc("matchmake", { p_queue_id: queue_id });

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error", details: error.message }, { status: 500 });
  }

  // data can be: null, [], or [{ room_id: null }] or [{ room_id: "uuid" }]
  const room_id = Array.isArray(data) && data.length > 0 ? data[0]?.room_id : null;

  // ✅ IMPORTANT: only return room_id if it exists
  return NextResponse.json({ ok: true, room_id: room_id ?? null });
}
