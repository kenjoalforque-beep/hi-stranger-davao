import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isWithinOpenHour } from "@/lib/time";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.max(
    1,
    Math.min(60, Number(url.searchParams.get("days") || 14))
  );

  const admin = supabaseAdmin();

  // ✅ Real-time stats only between 9–10PM Manila time
  const realtimeEnabled = isWithinOpenHour();

  let online_users = 0;
  let waiting = 0;
  let live_rooms = 0;
  let chatting_rooms = 0;

  if (realtimeEnabled) {
    // 1) online users (seen in last 2 mins)
    const onlineRes = await admin
      .from("queue")
      .select("user_token", { count: "exact", head: true })
      .gte("last_seen", new Date(Date.now() - 2 * 60 * 1000).toISOString());
    online_users = onlineRes.count ?? 0;

    // 2) waitlist (active=true)
    const waitingRes = await admin
      .from("queue")
      .select("id", { count: "exact", head: true })
      .eq("active", true);
    waiting = waitingRes.count ?? 0;

    // 3) live rooms
    const liveRes = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .is("ended_at", null);
    live_rooms = liveRes.count ?? 0;

    // 4) actively chatting rooms = live + last_msg_at within 2 mins
    const chatRes = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .is("ended_at", null)
      .gte("last_msg_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());
    chatting_rooms = chatRes.count ?? 0;
  }

  // ✅ Daily trend (joins + unique users) — always available
  const { data: daily, error: dailyErr } = await admin.rpc(
    "admin_daily_user_stats",
    { p_days: days }
  );

  if (dailyErr) {
    return NextResponse.json(
      { ok: false, error: "daily_stats_failed", details: dailyErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    realtime_enabled: realtimeEnabled, // helpful for the UI label later
    online_users,
    waiting,
    live_rooms,
    chatting_rooms,
    daily: daily ?? [],
  });
}
