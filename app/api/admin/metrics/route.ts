import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DailyRow = {
  day: string;
  unique_users: number;
  joins: number;
  matches: number;
  chats: number;
};

function manilaNowParts() {
  const now = new Date();

  const tf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const tp = tf.formatToParts(now).reduce<Record<string, string>>((a, p) => {
    if (p.type !== "literal") a[p.type] = p.value;
    return a;
  }, {});

  const df = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dateStr = df.format(now); // YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));

  return {
    y,
    m,
    d,
    h: Number(tp.hour ?? "0"),
    min: Number(tp.minute ?? "0"),
    s: Number(tp.second ?? "0"),
  };
}

function getTodaySessionWindowUTC() {
  const p = manilaNowParts();

  // Manila is UTC+8, so:
  // 21:00 Manila == 13:00 UTC
  // 22:00 Manila == 14:00 UTC
  const startUTC = Date.UTC(p.y, p.m - 1, p.d, 13, 0, 0);
  const endUTC = Date.UTC(p.y, p.m - 1, p.d, 14, 0, 0);

  return {
    startIso: new Date(startUTC).toISOString(),
    endIso: new Date(endUTC).toISOString(),
  };
}

function isWithinManilaSessionNow() {
  const p = manilaNowParts();
  const nowSec = p.h * 3600 + p.min * 60 + p.s;
  return nowSec >= 21 * 3600 && nowSec < 22 * 3600; // 21:00:00 to 21:59:59
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.max(
    1,
    Math.min(60, Number(url.searchParams.get("days") || 14))
  );

  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const realtime_enabled = isWithinManilaSessionNow();
  const { startIso, endIso } = getTodaySessionWindowUTC();

  // ================= REAL-TIME (TODAY 9–10PM ONLY) =================
  // If outside session, return zeros so your UI "Session inactive" is consistent.
  let online_users = 0;
  let waiting = 0;
  let live_rooms = 0;
  let chatting_rooms = 0;

  if (realtime_enabled) {
    const seenCutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    // Online users: joined tonight + seen recently
    const onlineRes = await admin
      .from("queue")
      .select("id", { count: "exact", head: true })
      .gte("joined_at", startIso)
      .lt("joined_at", endIso)
      .gte("last_seen", seenCutoffIso);

    online_users = onlineRes.count ?? 0;

    // Waitlist: joined tonight + still active
    const waitingRes = await admin
      .from("queue")
      .select("id", { count: "exact", head: true })
      .gte("joined_at", startIso)
      .lt("joined_at", endIso)
      .eq("active", true);

    waiting = waitingRes.count ?? 0;

    // Live rooms: created/started tonight + not ended
    const liveRes = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .is("ended_at", null);

    live_rooms = liveRes.count ?? 0;

    // Chatting rooms: live tonight + last_msg_at within 2 mins
    const chattingRes = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .is("ended_at", null)
      .not("last_msg_at", "is", null)
      .gte("last_msg_at", seenCutoffIso);

    chatting_rooms = chattingRes.count ?? 0;
  }

  // ================= HISTORICAL (DAILY) =================
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
    now: nowIso,
    realtime_enabled,
    online_users,
    waiting,
    live_rooms,
    chatting_rooms,
    daily: (daily ?? []) as DailyRow[],
  });
}
