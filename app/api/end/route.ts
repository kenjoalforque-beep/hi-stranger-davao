import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isUuid(v: any) {
  return typeof v === "string" && /^[0-9a-fA-F-]{36}$/.test(v);
}

// Philippine date as YYYY-MM-DD
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

  const room_id = body?.room_id;
  const user_token = body?.user_token;

  // ✅ NEW: mode controls whether this counts toward the nightly self-end limit
  // "user"  = user clicked End chat (counts + enforces limit)
  // "system" = auto-close at 10PM (does NOT count, does NOT enforce limit)
  const mode: "user" | "system" = body?.mode === "system" ? "system" : "user";

  if (!isUuid(room_id) || !isUuid(user_token)) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload" },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();

  // 1) Load room
  const roomRes = await admin
    .from("rooms")
    .select("id, a_queue_id, b_queue_id, ended_at")
    .eq("id", room_id)
    .maybeSingle();

  if (roomRes.error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: roomRes.error.message },
      { status: 500 }
    );
  }

  const room = roomRes.data;
  if (!room)
    return NextResponse.json(
      { ok: false, error: "room_not_found" },
      { status: 404 }
    );

  if (room.ended_at) {
    return NextResponse.json({ ok: true, ended: true });
  }

  // 2) Identify caller is in this room (a or b)
  const qRes = await admin
    .from("queue")
    .select("id, user_token")
    .in("id", [room.a_queue_id, room.b_queue_id]);

  if (qRes.error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: qRes.error.message },
      { status: 500 }
    );
  }

  const rows = qRes.data ?? [];
  const a = rows.find((x) => x.id === room.a_queue_id);
  const b = rows.find((x) => x.id === room.b_queue_id);

  let side: "a" | "b" | null = null;
  if (a?.user_token === user_token) side = "a";
  if (b?.user_token === user_token) side = "b";

  if (!side) {
    return NextResponse.json({ ok: false, error: "not_in_room" }, { status: 403 });
  }

  // ✅ SYSTEM MODE: end the room WITHOUT touching night_limits
  if (mode === "system") {
    const endRes = await admin
      .from("rooms")
      .update({
        ended_at: new Date().toISOString(),
        ended_by_token: user_token,
        ended_by_side: side,
      })
      .eq("id", room_id);

    if (endRes.error) {
      return NextResponse.json(
        { ok: false, error: "db_error", details: endRes.error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, ended: true, mode: "system" });
  }

  // 3) USER MODE: Read current per-night count WITHOUT resetting it
  const night_date = philippineDateISO();

  const readRes = await admin
    .from("night_limits")
    .select("self_end_count")
    .eq("user_token", user_token)
    .eq("night_date", night_date)
    .maybeSingle();

  if (readRes.error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: readRes.error.message },
      { status: 500 }
    );
  }

  let currentCount = Number(readRes.data?.self_end_count ?? 0);

  // If row didn't exist, create it once (do NOT overwrite later)
  if (!readRes.data) {
    const ins = await admin
      .from("night_limits")
      .insert({ user_token, night_date, self_end_count: 0 });

    if (ins.error) {
      return NextResponse.json(
        { ok: false, error: "db_error", details: ins.error.message },
        { status: 500 }
      );
    }

    currentCount = 0;
  }

  if (currentCount >= 2) {
    return NextResponse.json({ ok: false, error: "limit_reached" }, { status: 403 });
  }

  // 4) End room + record who ended
  const endRes = await admin
    .from("rooms")
    .update({
      ended_at: new Date().toISOString(),
      ended_by_token: user_token,
      ended_by_side: side,
    })
    .eq("id", room_id);

  if (endRes.error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: endRes.error.message },
      { status: 500 }
    );
  }

  // 5) Increment per-night count
  const newCount = currentCount + 1;

  const incRes = await admin
    .from("night_limits")
    .update({ self_end_count: newCount })
    .eq("user_token", user_token)
    .eq("night_date", night_date);

  if (incRes.error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: incRes.error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ended: true, self_end_count: newCount, night_date, mode: "user" });
}
