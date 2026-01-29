import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isWithinOpenHour } from "@/lib/time";

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

export async function POST(req: Request) {
  /**
   * IMPORTANT:
   * - We allow polling UNTIL 10:00 PM
   * - matchmake() itself prevents new matches after 9:50
   * - This route must NOT block fetching an already-created room
   */

  // Hard stop only after 10:00 PM (production)
  if (process.env.NODE_ENV !== "development") {
    if (!isWithinOpenHour()) {
      return NextResponse.json(
        { ok: false, error: "closed" },
        { status: 403 }
      );
    }
  }

  const body = await req.json().catch(() => null);
  const queue_id = body?.queue_id;

  if (!isUuid(queue_id)) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload" },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  // Call DB function (safe to call until 10PM)
  const { data, error } = await admin.rpc("matchmake", {
    p_queue_id: queue_id,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: error.message },
      { status: 500 }
    );
  }

  const room_id =
    Array.isArray(data) && data.length > 0 ? data[0]?.room_id : null;

  // Always return ok:true so wait page keeps polling
  return NextResponse.json({
    ok: true,
    room_id: room_id ?? null,
  });
}
