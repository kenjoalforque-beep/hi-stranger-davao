"use client";

import { useEffect, useState } from "react";

type DailyRow = {
  day: string;
  joins: number;
  unique_users: number;
  matches: number;
  chats: number;
};

type Breakdown = { men: number; women: number; nopref: number };

type Metrics = {
  now: string;

  // realtime
  realtime_enabled: boolean;
  online_users: number;
  waiting: number;
  live_rooms: number;
  chatting_rooms: number;

  // NEW
  realtime_breakdowns: null | {
    online_users: Breakdown;
    waiting: Breakdown;
    live_rooms: Breakdown;
    chatting_rooms: Breakdown;
  };

  // historical
  daily: DailyRow[];
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        if (!alive) return;
        setErr("");

        const res = await fetch("/api/admin/metrics?days=14", {
          cache: "no-store",
        });

        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP_${res.status}`);
        }

        if (!alive) return;
        setMetrics(data as Metrics);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
    }

    setLoading(true);
    load();
    const t = setInterval(load, 2000);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  // recent first
  const daily = [...(metrics?.daily ?? [])].reverse();

  // totals (based on whatever days=14 returns)
  const totals = daily.reduce(
    (a, d) => ({
      users: a.users + Number(d.unique_users || 0),
      joins: a.joins + Number(d.joins || 0),
      matches: a.matches + Number(d.matches || 0),
      chats: a.chats + Number(d.chats || 0),
    }),
    { users: 0, joins: 0, matches: 0, chats: 0 }
  );

  const maxUniq = Math.max(1, ...daily.map((d) => Number(d.unique_users || 0)));

  const bd = metrics?.realtime_breakdowns ?? null;

  return (
    <main className="min-h-screen bg-teal-700 p-5">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] p-6">
          <h1 className="text-2xl text-teal-800 font-semibold">
            Hi, Stranger — Admin Dashboard
          </h1>

          <p className="mt-1 text-sm text-gray-600">
            {metrics?.now
              ? `Last updated: ${new Date(metrics.now).toLocaleString()}`
              : "—"}
          </p>

          {loading && <p className="mt-4 text-gray-700">Loading…</p>}

          {err && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              Error: {err}
            </div>
          )}

          {/* ================= REAL-TIME SECTION ================= */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-teal-800">
              Real-time session (9:00–10:00 PM only)
            </h2>
            <p className="text-sm text-gray-600">
              Shows live activity for <b>today’s session only</b>.
            </p>

            {!metrics?.realtime_enabled ? (
              <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-gray-600">
                Session inactive. Real-time stats appear only between 9:00–10:00
                PM.
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat
                  label="Users (online)"
                  value={metrics.online_users}
                  breakdown={bd?.online_users ?? null}
                />
                <Stat
                  label="Joins (waiting)"
                  value={metrics.waiting}
                  breakdown={bd?.waiting ?? null}
                />
                <Stat
                  label="Matches (live rooms)"
                  value={metrics.live_rooms}
                  breakdown={bd?.live_rooms ?? null}
                />
                <Stat
                  label="Chats (active)"
                  value={metrics.chatting_rooms}
                  breakdown={bd?.chatting_rooms ?? null}
                />
              </div>
            )}
          </div>

          {/* ================= ALL-TIME TOTALS ================= */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-teal-800">
              All-time totals
            </h2>
            <p className="text-sm text-gray-600">
              Totals based on the last 14 days shown below.
            </p>

            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Users" value={totals.users} />
              <Stat label="Joins" value={totals.joins} />
              <Stat label="Matches" value={totals.matches} />
              <Stat label="Chats" value={totals.chats} />
            </div>
          </div>

          {/* ================= HISTORICAL SECTION ================= */}
          <div className="mt-10">
            <h2 className="text-lg font-semibold text-teal-800">
              All-time activity
            </h2>
            <p className="text-sm text-gray-600">
              Daily users, joins, matches, and chats.
            </p>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
              {daily.length === 0 ? (
                <div className="text-sm text-gray-600">No data yet.</div>
              ) : (
                <div className="space-y-2">
                  {daily.map((d) => {
                    const w = Math.round(
                      (Number(d.unique_users || 0) / maxUniq) * 100
                    );

                    const users = Number(d.unique_users || 0);
                    const joins = Number(d.joins || 0);
                    const matches = Number(d.matches || 0);
                    const chats = Number(d.chats || 0);

                    return (
                      <div key={d.day} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-gray-600 font-mono">
                          {d.day}
                        </div>

                        <div className="flex-1">
                          <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className="h-3 bg-teal-600"
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        </div>

                        <div className="w-[320px] text-right text-xs text-gray-700">
                          <b>{users}</b> users · {joins} joins · {matches}{" "}
                          matches · {chats} chats
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          {/* ===================================================== */}
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  breakdown,
}: {
  label: string;
  value: number;
  breakdown?: Breakdown | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-teal-800">{value}</div>

      {breakdown ? (
        <div className="mt-2 text-[11px] text-gray-700 space-y-1">
          <div>Men: <b>{breakdown.men}</b></div>
          <div>Women: <b>{breakdown.women}</b></div>
          <div>No pref: <b>{breakdown.nopref}</b></div>
        </div>
      ) : null}
    </div>
  );
}
