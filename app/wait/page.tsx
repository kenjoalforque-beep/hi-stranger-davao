"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function WaitPage() {
  const sp = useSearchParams();
  const queueId = sp.get("queue_id");

  const [iam, setIam] = useState<string | null>(null);
  const [lookingFor, setLookingFor] = useState<string | null>(null);

  const [msg, setMsg] = useState("Waiting for a match…");
  const [last, setLast] = useState<any>(null);

  useEffect(() => {
    setIam(sessionStorage.getItem("iam"));
    setLookingFor(sessionStorage.getItem("lookingFor"));
  }, []);

  useEffect(() => {
    if (!queueId) return;

    let stopped = false;

    async function tick() {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ queue_id: queueId }),
        });

        const data = await res.json().catch(() => null);
        if (stopped) return;

        setLast({ status: res.status, data });

        if (!res.ok || !data?.ok) {
          setMsg("Match error (see details below).");
          return;
        }

        if (data.room_id) {
          window.location.href = `/room/${encodeURIComponent(data.room_id)}`;
          return;
        }

        setMsg("Still waiting…");
      } catch (e: any) {
        if (!stopped) {
          setMsg("Network hiccup… retrying.");
          setLast({ error: String(e?.message ?? e) });
        }
      }
    }

    tick();
    const t = setInterval(tick, 2000);

    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [queueId]);

  return (
    <main className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-teal-600">
            Finding a stranger…
          </h1>

          <p className="mt-2 text-sm text-gray-700">{msg}</p>

          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-gray-800">
            <div>
              Queue ID: <b>{queueId ?? "-"}</b>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              I am: <b>{iam ?? "-"}</b> • Looking for: <b>{lookingFor ?? "-"}</b>
            </div>
          </div>

          {last ? (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap">
              <div className="font-semibold mb-2">Debug: /api/match response</div>
              {JSON.stringify(last, null, 2)}
            </div>
          ) : null}

          <button
            className="mt-4 w-full rounded-xl bg-gray-200 py-3 font-medium text-gray-700 hover:bg-gray-300 transition"
            onClick={() => (window.location.href = "/")}
          >
            Back
          </button>
        </div>
      </div>

      <footer className="pb-4 flex justify-center">
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs text-gray-700">
          Original concept by Kenjo © 2026
        </div>
      </footer>
    </main>
  );
}
