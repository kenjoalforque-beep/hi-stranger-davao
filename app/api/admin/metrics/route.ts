import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

export async function GET(req: Request) {
  

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(60, Number(url.searchParams.get("days") || 14)));

  const admin = supabaseAdmin();

  // 1) online users (seen in last 2 mins)
  const { count: online_users } = await admin
    .from("queue")
    .select("user_token", { count: "exact", head: true })
    .gte("last_seen", new Date(Date.now() - 2 * 60 * 1000).toISOString());

  // 2) waitlist (active=true)
  const { count: waiting } = await admin
    .from("queue")
    .select("id", { count: "exact", head: true })
    .eq("active", true);

  // 3) live rooms
  const { count: live_rooms } = await admin
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .is("ended_at", null);

  // 4) actively chatting rooms = live + last_msg_at within 2 mins
  const { count: chatting_rooms } = await admin
    .from("rooms")
    .select("id", { count: "exact", head: true })
    .is("ended_at", null)
    .gte("last_msg_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());

  // Daily trend (joins + unique users)
  const { data: daily, error: dailyErr } = await admin.rpc("admin_daily_user_stats", { p_days: days });

  if (dailyErr) {
    return NextResponse.json(
      { ok: false, error: "daily_stats_failed", details: dailyErr.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    online_users: online_users ?? 0,
    waiting: waiting ?? 0,
    live_rooms: live_rooms ?? 0,
    chatting_rooms: chatting_rooms ?? 0,
    daily: daily ?? [],
  });
}
