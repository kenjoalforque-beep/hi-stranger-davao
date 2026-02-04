"use client";

import { useEffect, useMemo, useState } from "react";

type DailyRow = { day: string; joins: number; unique_users: number };

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const [metrics, setMetrics] = useState<{
    now: string;
    online_users: number;
    waiting: number;
    live_rooms: number;
    chatting_rooms: number;
    daily: DailyRow[];
  } | null>(null);

 
  

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setErr("");
        const res = await fetch("/api/admin/metrics?days=14", { cache: "no-store" });


        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.ok) {
          throw new Error(data?.error || `HTTP_${res.status}`);
        }

        if (!alive) return;
        setMetrics(data);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(String(e?.message || e));
        setLoading(false);
      }
    }

    load();
    const t = setInterval(load, 2000); // ✅ "real-time" feel
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [token]);

  const daily = metrics?.daily ?? [];
  const maxUniq = Math.max(1, ...daily.map((d) => Number(d.unique_users || 0)));

  return (
    <main className="min-h-screen bg-teal-700 p-5">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] p-6">
          <h1 className="text-2xl text-teal-800 font-semibold">Hi, Stranger — Admin Dashboard</h1>
          <p className="mt-1 text-sm text-gray-600">
            {metrics?.now ? `Last updated: ${new Date(metrics.now).toLocaleString()}` : "—"}
          </p>


          {loading ? <p className="mt-4 text-gray-700">Loading…</p> : null}
          {err ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              Error: {err}
            </div>
          ) : null}

          {metrics ? (
            <>
              <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Online users" value={metrics.online_users} />
                <Stat label="Waitlist" value={metrics.waiting} />
                <Stat label="Live rooms" value={metrics.live_rooms} />
                <Stat label="Chatting rooms" value={metrics.chatting_rooms} />
              </div>

              <div className="mt-8">
                <h2 className="text-lg font-semibold text-teal-800">Daily trend (last 14 days)</h2>
                <p className="text-sm text-gray-600">Unique users + join events.</p>

                <div className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
                  {daily.length === 0 ? (
                    <div className="text-sm text-gray-600">No data yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {daily.map((d) => {
                        const w = Math.round((Number(d.unique_users || 0) / maxUniq) * 100);
                        return (
                          <div key={d.day} className="flex items-center gap-3">
                            <div className="w-24 text-xs text-gray-600 font-mono">{d.day}</div>
                            <div className="flex-1">
                              <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                                <div className="h-3 bg-teal-600" style={{ width: `${w}%` }} />
                              </div>
                            </div>
                            <div className="w-28 text-right text-xs text-gray-700">
                              <b>{d.unique_users}</b> uniq · {d.joins} joins
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-gray-600">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-teal-800">{value}</div>
    </div>
  );
}
