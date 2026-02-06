"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type WaitState = "searching" | "no_match" | "closed";
type NotifStatus = "unsupported" | "default" | "granted" | "denied";

// ---------------- Manila time helpers ----------------
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

// ---------------- Audio helpers ----------------
// Put file here: /public/sounds/match.mp3
function makeMatchAudio() {
  try {
    const a = new Audio("/sounds/match.mp3");
    a.preload = "auto";
    a.volume = 0.85;
    return a;
  } catch {
    return null;
  }
}

async function tryPlay(a: HTMLAudioElement | null) {
  if (!a) return false;
  try {
    // Reset to start so repeated plays work
    try {
      a.currentTime = 0;
    } catch {}
    await a.play();
    return true;
  } catch {
    return false;
  }
}

// ---------------- Notification helpers ----------------
function getNotifStatus(): NotifStatus {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return (Notification.permission as NotifStatus) || "default";
}

function showMatchNotification(roomId: string) {
  try {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const n = new Notification("Hi, Stranger", {
      body: "You’ve been matched! Tap to open the chat.",
      // icon: "/icon-192.png", // optional if you have it
      silent: true, // keep it silent; sound is handled separately (foreground only)
    });

    n.onclick = () => {
      try {
        window.focus();
      } catch {}
      window.location.href = `/room/${roomId}`;
      try {
        n.close();
      } catch {}
    };
  } catch {}
}

function WaitInner() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get("qid");

  const [state, setState] = useState<WaitState>("searching");

  // 🔊 Sound toggle (persisted)
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  // 🔔 Notifications status
  const [notifStatus, setNotifStatus] = useState<NotifStatus>("unsupported");

  // Keep refs so timers can stop safely
  const pollRef = useRef<any>(null);
  const timeRef = useRef<any>(null);
  const stoppedRef = useRef(false);

  // Audio element (created once client-side)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const soundArmedRef = useRef(false); // becomes true after user gesture successfully plays once

  // Load stored prefs on mount
  useEffect(() => {
    try {
      const se = localStorage.getItem("hs_sound_enabled");
      setSoundEnabled(se === "1");
    } catch {}
    setNotifStatus(getNotifStatus());

    // Create audio once
    audioRef.current = makeMatchAudio();
  }, []);

  // Persist sound toggle
  useEffect(() => {
    try {
      localStorage.setItem("hs_sound_enabled", soundEnabled ? "1" : "0");
    } catch {}
  }, [soundEnabled]);

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

      // 🔴 tell backend this user left the queue
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

  async function armSound() {
    // iOS requires a user gesture before any future play attempts have a chance
    const ok = await tryPlay(audioRef.current);
    if (ok) {
      soundArmedRef.current = true;
    }
    return ok;
  }

  async function requestNotifications() {
    if (!("Notification" in window)) {
      setNotifStatus("unsupported");
      return;
    }
    try {
      const perm = await Notification.requestPermission();
      setNotifStatus((perm as NotifStatus) || getNotifStatus());
    } catch {
      setNotifStatus(getNotifStatus());
    }
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

          const roomId = String(data.room_id);

          // 🔔 Notification (works best when user leaves Safari; still permission-based)
          showMatchNotification(roomId);

          // 🔊 Sound (foreground-only on iPhone; requires earlier user gesture)
          if (soundEnabled && soundArmedRef.current) {
            // Try to start sound before navigation
            await tryPlay(audioRef.current);
            setTimeout(() => {
              window.location.href = `/room/${roomId}`;
            }, 250);
          } else {
            window.location.href = `/room/${roomId}`;
          }
        }
      } catch {
        // ignore network hiccups
      }
    }, 2000);

    return () => stopAllTimers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, soundEnabled]);

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

  const notifLine = useMemo(() => {
    if (notifStatus === "unsupported") return "Notifications not supported on this browser.";
    if (notifStatus === "granted") return "Notifications enabled ✅";
    if (notifStatus === "denied") return "Notifications blocked (enable in Safari settings).";
    return "Notifications not enabled yet.";
  }, [notifStatus]);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-teal-700/30 bg-teal-600 p-6 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-white">{ui.title}</h1>
        <p className="mt-2 text-sm text-white/90">{ui.subtitle}</p>

        {/* 🔔 + 🔊 Controls (only show while searching) */}
        {ui.showSpinner ? (
          <div className="mt-5">
            <div className="flex justify-center">
              <div className="h-6 w-6 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            </div>

            <div className="mt-5 rounded-2xl bg-white/10 border border-white/15 p-4 text-left">
              <div className="text-xs text-white/90 font-semibold">Alerts</div>

              {/* Sound toggle */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-sm text-white">
                  Sound on match <span className="text-white/70">(Safari must be open)</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const next = !soundEnabled;
                    setSoundEnabled(next);

                    // If turning ON, try to arm immediately (required by iOS)
                    if (!soundEnabled && next) {
                      await armSound();
                    }
                  }}
                  className={
                    soundEnabled
                      ? "px-3 py-2 rounded-xl bg-white text-teal-700 text-sm font-medium"
                      : "px-3 py-2 rounded-xl bg-white/15 text-white text-sm font-medium border border-white/20"
                  }
                >
                  {soundEnabled ? "On" : "Off"}
                </button>
              </div>

              {/* If sound enabled but not armed */}
              {soundEnabled && !soundArmedRef.current ? (
                <button
                  type="button"
                  onClick={armSound}
                  className="mt-3 w-full rounded-xl bg-white py-2 text-teal-700 text-sm font-medium shadow-sm hover:shadow-md active:scale-[0.98] transition"
                >
                  Enable sound notifications
                </button>
              ) : null}

              <div className="mt-4 h-px bg-white/15" />

              {/* Notifications */}
              <div className="mt-3 flex items-start justify-between gap-3">
                <div className="text-sm text-white">
                  Notifications <div className="text-xs text-white/70">{notifLine}</div>
                </div>

                {notifStatus === "default" ? (
                  <button
                    type="button"
                    onClick={requestNotifications}
                    className="px-3 py-2 rounded-xl bg-white text-teal-700 text-sm font-medium"
                  >
                    Allow
                  </button>
                ) : (
                  <div className="text-xs text-white/70 mt-2">
                    {notifStatus === "granted" ? "On" : notifStatus === "denied" ? "Blocked" : ""}
                  </div>
                )}
              </div>

              <div className="mt-3 text-xs text-white/75">
                Tip: On iPhone, sound won’t play if you switch to another app. Notifications are more reliable.
              </div>
            </div>
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
