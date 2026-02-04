"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type WaitState = "searching" | "no_match" | "closed";

function getManilaNowParts() {
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

  const hh = Number(tp.hour ?? "0");
  const mm = Number(tp.minute ?? "0");
  const ss = Number(tp.second ?? "0");
  return { hh, mm, ss };
}

function isAfterManilaTime(h: number, m: number) {
  const { hh, mm } = getManilaNowParts();
  return hh > h || (hh === h && mm >= m);
}

function WaitInner() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get("qid");

  const [state, setState] = useState<WaitState>("searching");

  // Keep refs so timers can stop safely
  const pollRef = useRef<any>(null);
  const timeRef = useRef<any>(null);
  const stoppedRef = useRef(false);

  function stopAllTimers() {
    if (stoppedRef.current) return;
    stoppedRef.current = true;

    if (pollRef.current) clearInterval(pollRef.current);
    if (timeRef.current) clearInterval(timeRef.current);

    pollRef.current = null;
    timeRef.current = null;
  }

  // Decide which state we should be in based on Manila time
  function applyTimeRules() {
    // 10:00 PM cutoff (hard close)
    if (isAfterManilaTime(22, 0)) {
      stopAllTimers();
      setState("closed");
      return true;
    }

    // 9:50 PM cutoff (stop trying to match)
if (isAfterManilaTime(21, 50)) {
  stopAllTimers();

  // 🔴 NEW: tell backend this user left the queue
  if (queueId) {
    fetch("/api/leave", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queue_id: queueId }),
    }).catch(() => null);
  }

  setState("no_match");
  return true;
}


    return false;
  }

 useEffect(() => {
  if (!queueId) {
    setState("no_match");
    return;
  }

    // If already past cutoff when page loads, apply immediately.
    if (applyTimeRules()) return;

    // Check time every second (lightweight)
    timeRef.current = setInterval(() => {
      applyTimeRules();
    }, 1000);

    // Poll matching API (only while searching)
    pollRef.current = setInterval(async () => {
      // If time rule already switched state, do nothing
      if (stoppedRef.current) return;

      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ queue_id: queueId }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.ok && data?.room_id) {
          stopAllTimers();
          window.location.href = `/room/${data.room_id}`;
        }
      } catch {
        // ignore network hiccups
      }
    }, 2000);

    return () => stopAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId]);

  const ui = useMemo(() => {
    if (state === "closed") {
      return {
        title: "Chat has ended.",
        subtitle: "Thank you for chatting tonight. See you tomorrow.",
        showSpinner: false,
      };
    }

    if (state === "no_match") {
      return {
        title: "We couldn’t find you a match tonight.",
        subtitle: "Please try again tomorrow.",
        showSpinner: false,
      };
    }

    return {
      title: "Finding a stranger…",
      subtitle: "Please keep this page open.",
      showSpinner: true,
    };
  }, [state]);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-teal-700/30 bg-teal-600 p-6 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-white">{ui.title}</h1>
        <p className="mt-2 text-sm text-white/90">{ui.subtitle}</p>

        {ui.showSpinner ? (
          <div className="mt-5 flex justify-center">
            <div className="h-6 w-6 rounded-full border-2 border-white/40 border-t-white animate-spin" />
          </div>
        ) : (
          <button
            className="mt-6 w-full rounded-2xl bg-white py-3 text-teal-700 font-medium shadow-sm hover:shadow-md active:scale-[0.98] transition"
            onClick={() => (window.location.href = "/")}
          >
            Back to main page
          </button>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6">Loading…</div>}>
      <WaitInner />
    </Suspense>
  );
}
