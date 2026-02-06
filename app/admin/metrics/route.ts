import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type DailyRow = {
  day: string;
  unique_users: number;
  joins: number;
  matches: number;
  chats: number;
};

type Breakdown = { men: number; women: number; nopref: number };

function getManilaSessionRangeISO() {
  // Today in Manila (YYYY-MM-DD)
  const now = new Date();
  const df = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const dateStr = df.format(now); // YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));

  // 21:00 Manila == 13:00 UTC, 22:00 Manila == 14:00 UTC
  const startUTC = Date.UTC(y, m - 1, d, 13, 0, 0);
  const endUTC = Date.UTC(y, m - 1, d, 14, 0, 0);

  return {
    startIso: new Date(startUTC).toISOString(),
    endIso: new Date(endUTC).toISOString(),
  };
}

function isRealtimeEnabledNow() {
  const now = new Date();
  const tf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = tf.formatToParts(now).reduce<Record<string, string>>((a, p) => {
    if (p.type !== "literal") a[p.type] = p.value;
    return a;
  }, {});
  const hh = Number(parts.hour ?? "0");
  const mm = Number(parts.minute ?? "0");

  // realtime only 21:00–22:00
  return (hh === 21) || (hh === 22 && mm === 0); // safe edge (22:00)
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const days = Math.max(1, Math.min(60, Number(url.searchParams.get("days") || 14)));

  const admin = supabaseAdmin();
  const nowIso = new Date().toISOString();

  const realtime_enabled = isRealtimeEnabledNow();
  const { startIso, endIso } = getManilaSessionRangeISO();
  const seenCutoffIso = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  // ---------- Real-time counts (unchanged logic style) ----------
  // NOTE: keep your existing logic if you already have it; this is the safe version.
  let online_users = 0;
  let waiting = 0;
  let live_rooms = 0;
  let chatting_rooms = 0;

  if (realtime_enabled) {
    const onlineRes = await admin
      .from("queue")
      .select("user_token", { count: "exact", head: true })
      .gte("joined_at", startIso)
      .lt("joined_at", endIso)
      .gte("last_seen", seenCutoffIso);

    online_users = onlineRes.count ?? 0;

    const waitRes = await admin
      .from("queue")
      .select("id", { count: "exact", head: true })
      .gte("joined_at", startIso)
      .lt("joined_at", endIso)
      .eq("active", true);

    waiting = waitRes.count ?? 0;

    const liveRes = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .is("ended_at", null);

    live_rooms = liveRes.count ?? 0;

    const chatRes = await admin
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .gte("started_at", startIso)
      .lt("started_at", endIso)
      .is("ended_at", null)
      .not("last_msg_at", "is", null)
      .gte("last_msg_at", seenCutoffIso);

    chatting_rooms = chatRes.count ?? 0;
  }

  // ---------- Real-time breakdowns (NEW) ----------
  let realtime_breakdowns:
    | {
        online_users: Breakdown;
        waiting: Breakdown;
        live_rooms: Breakdown;
        chatting_rooms: Breakdown;
      }
    | undefined;

  if (realtime_enabled) {
    const { data: bd, error: bdErr } = await admin.rpc("admin_realtime_breakdowns", {
      p_start: startIso,
      p_end: endIso,
    });

    if (!bdErr && Array.isArray(bd)) {
      const map = new Map<string, Breakdown>();
      for (const row of bd as any[]) {
        map.set(String(row.metric), {
          men: Number(row.men ?? 0),
          women: Number(row.women ?? 0),
          nopref: Number(row.nopref ?? 0),
        });
      }

      realtime_breakdowns = {
        online_users: map.get("online_users") ?? { men: 0, women: 0, nopref: 0 },
        waiting: map.get("waiting") ?? { men: 0, women: 0, nopref: 0 },
        live_rooms: map.get("live_rooms") ?? { men: 0, women: 0, nopref: 0 },
        chatting_rooms: map.get("chatting_rooms") ?? { men: 0, women: 0, nopref: 0 },
      };
    }
  }

  // ---------- Historical (daily) ----------
  const { data: daily, error: dailyErr } = await admin.rpc("admin_daily_user_stats", { p_days: days });

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
    realtime_breakdowns: realtime_breakdowns ?? null,

    daily: (daily ?? []) as DailyRow[],
  });
}
