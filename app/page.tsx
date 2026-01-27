"use client";

import { useEffect, useState } from "react";

type Status = "open" | "entry_closed" | "matching_closed" | "closed";

function getPhilippineNowParts() {
  const now = new Date();

  const tf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const timeParts = tf.formatToParts(now).reduce<Record<string, string>>(
    (a, p) => {
      if (p.type !== "literal") a[p.type] = p.value;
      return a;
    },
    {}
  );

  const df = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const dateStr = df.format(now); // YYYY-MM-DD
  const [y, m, d] = dateStr.split("-").map((x) => Number(x));

  const hh = Number(timeParts.hour);
  const mm = Number(timeParts.minute);
  const ss = Number(timeParts.second);

  return {
    y,
    m,
    d,
    hh,
    mm,
    ss,
    dateDisplay: new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Manila",
      month: "long",
      day: "2-digit",
      year: "numeric",
    }).format(now),
    timeDisplay: `${String(hh).padStart(2, "0")}:${String(mm).padStart(
      2,
      "0"
    )}:${String(ss).padStart(2, "0")}`,
  };
}

function msToHMS(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(
    2,
    "0"
  )}:${String(s).padStart(2, "0")}`;
}

function getNext9pmCountdownMs() {
  const now = new Date();
  const p = getPhilippineNowParts();

  // Target today 21:00 Manila => 13:00 UTC
  let targetUTC = Date.UTC(p.y, p.m - 1, p.d, 13, 0, 0);

  const nowManilaTotalSeconds = p.hh * 3600 + p.mm * 60 + p.ss;
  const ninePMSeconds = 21 * 3600;

  if (nowManilaTotalSeconds >= ninePMSeconds) {
    const t = new Date(targetUTC);
    t.setUTCDate(t.getUTCDate() + 1);
    targetUTC = t.getTime();
  }

  return targetUTC - now.getTime();
}

function safeUUID() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      // @ts-ignore
      return crypto.randomUUID();
    }
  } catch {}
  return `x_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function isIOS() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";

  // Classic iOS devices
  const classic = /iPad|iPhone|iPod/.test(ua);

  // iPadOS sometimes reports as Mac; detect touch-capable Mac UA
  const iPadOS =
    ua.includes("Mac") &&
    typeof document !== "undefined" &&
    "ontouchend" in document;

  return (classic || iPadOS) && !(window as any).MSStream;
}

function isAndroid() {
  if (typeof navigator === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function isInStandaloneMode() {
  return (
    (typeof window !== "undefined" &&
      (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false)) ||
    ((navigator as any)?.standalone === true)
  );
}

export default function Page() {
  const [phDate, setPhDate] = useState("");
  const [phTime, setPhTime] = useState("--:--:--");
  const [status, setStatus] = useState<Status>("closed"); // ✅ default CLOSED
  const [countdown, setCountdown] = useState<string>("");

  const [iAm, setIAm] = useState<"man" | "woman" | "unspecified" | null>(null);
  const [lookingFor, setLookingFor] = useState<"men" | "women" | "any" | null>(
    null
  );

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const ready = status === "open" && iAm !== null && lookingFor !== null;

  // ---- Install-as-app state ----
  const [showInstall, setShowInstall] = useState(false);
  const [iosInstallOpen, setIosInstallOpen] = useState(false);
  const [androidInstallOpen, setAndroidInstallOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  // --------------------------------

  useEffect(() => {
    function tick() {
      const p = getPhilippineNowParts();
      setPhDate(p.dateDisplay);
      setPhTime(p.timeDisplay);

      if (status === "closed") {
        const ms = getNext9pmCountdownMs();
        setCountdown(msToHMS(ms));
      } else {
        setCountdown("");
      }
    }

    async function loadStatus() {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        const data = await res.json();
        if (data?.state) setStatus(data.state);
      } catch {
        // keep last known status
      }
    }

    loadStatus();
    tick();

    const clock = setInterval(tick, 1000);
    const poll = setInterval(loadStatus, 5000);

    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [status]);

  // Install-as-app hooks
  useEffect(() => {
    if (isInStandaloneMode()) {
      setShowInstall(false);
      return;
    }

    // Show button on iOS + Android
    if (isIOS() || isAndroid()) setShowInstall(true);

    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleJoin() {
    if (!ready || joining) return;

    setJoining(true);
    setJoinError(null);

    try {
      const user_token =
        sessionStorage.getItem("hs_user_token") ??
        (() => {
          const t = safeUUID();
          sessionStorage.setItem("hs_user_token", t);
          return t;
        })();

      const res = await fetch("/api/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          iam: iAm,
          lookingFor,
          user_token,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        const msg =
          data?.error === "entry_closed"
            ? "Entry is closed for tonight."
            : data?.error === "matching_closed"
            ? "Matching is closed for tonight."
            : data?.error === "closed"
            ? "Come back at 9:00 PM."
            : data?.error === "invalid_payload"
            ? "Please select both options."
            : "Something went wrong. Please try again.";
        setJoinError(msg);
        return;
      }

      sessionStorage.setItem("iam", String(iAm));
      sessionStorage.setItem("lookingFor", String(lookingFor));

      window.location.href = `/wait?qid=${data.queue_id}`;
    } catch {
      setJoinError("Something blocked the request. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  async function handleInstallClick() {
    if (isInStandaloneMode()) return;

    // iOS -> show iOS steps ONLY
    if (isIOS()) {
      setIosInstallOpen(true);
      setAndroidInstallOpen(false);
      return;
    }

    // Android -> try native prompt, else show Android steps
    if (isAndroid()) {
      if (deferredPrompt) {
        try {
          deferredPrompt.prompt();
          await deferredPrompt.userChoice?.catch(() => null);
        } catch {}
        setDeferredPrompt(null);
        // Hide button if they installed; but we can't be sure -> keep it simple
        return;
      }

      // Fallback: show Android instructions (NOT iOS)
      setAndroidInstallOpen(true);
      setIosInstallOpen(false);
      return;
    }

    // Other platforms: do nothing / optional message
    setIosInstallOpen(false);
    setAndroidInstallOpen(false);
  }

  const optionClass =
    "flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/70 backdrop-blur px-4 py-3 shadow-sm hover:shadow-md hover:border-teal-300 hover:bg-white transition";

  return (
<main className="min-h-screen bg-gradient-to-b from-teal-600 via-teal-700 to-teal-800 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] p-6">
          <h1
            className="font-normal text-teal-700 leading-none tracking-wide"
            style={{
              fontFamily: "var(--font-chewy)",
              fontSize: "clamp(3rem, 9vw, 4.5rem)",
              textShadow: "0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            Hi, Stranger
          </h1>

          <p className="mt-2 text-sm text-gray-600">
            Anonymous 1-on-1 chat. No history. 9:00–10:00 PM (PH).
          </p>

          <div className="mt-4 rounded-2xl border border-teal-100 bg-white/70 backdrop-blur p-4 shadow-sm">
            <div className="text-sm text-gray-800">
              <span className="font-medium">{phDate}</span>{" "}
              <span className="font-mono">{phTime}</span>{" "}
              <span className="text-gray-600">PH Time</span>
            </div>

            <div className="mt-1 text-xs text-gray-600 flex items-center gap-2 flex-wrap">
              <span>
                Status:{" "}
                <span
  className={`font-medium ${
    status === "closed" ? "text-red-600" : "text-teal-700"
  }`}
>
  {status === "open"
    ? "Open"
    : status === "entry_closed"
    ? "Entry closed"
    : status === "matching_closed"
    ? "Matching closed"
    : "Closed"}
</span>

              </span>

              {status === "closed" && (
                <span className="text-gray-500">
                  · Opens in{" "}
                  <span className="font-mono font-semibold text-red-600">
  {countdown || "--:--:--"}
</span>

                </span>
              )}
            </div>
          </div>

          <p className="mt-6 text-sm font-semibold text-gray-800">I am a…</p>

          <div className="mt-3 space-y-2">
            <label className={optionClass}>
              <input
                type="radio"
                name="iam"
                disabled={status !== "open" || joining}
                onChange={() => setIAm("man")}
                className="accent-teal-600"
              />
              <span className="text-gray-800">Man</span>
            </label>

            <label className={optionClass}>
              <input
                type="radio"
                name="iam"
                disabled={status !== "open" || joining}
                onChange={() => setIAm("woman")}
                className="accent-teal-600"
              />
              <span className="text-gray-800">Woman</span>
            </label>

            <label className={optionClass}>
              <input
                type="radio"
                name="iam"
                disabled={status !== "open" || joining}
                onChange={() => setIAm("unspecified")}
                className="accent-teal-600"
              />
              <span className="text-gray-800">Prefer not to say</span>
            </label>
          </div>

          <p className="mt-6 text-sm font-semibold text-gray-800">
            I want to chat with…
          </p>

          <div className="mt-3 space-y-2">
            <label className={optionClass}>
              <input
                type="radio"
                name="lookingFor"
                disabled={status !== "open" || joining}
                onChange={() => setLookingFor("men")}
                className="accent-teal-600"
              />
              <span className="text-gray-800">Men</span>
            </label>

            <label className={optionClass}>
              <input
                type="radio"
                name="lookingFor"
                disabled={status !== "open" || joining}
                onChange={() => setLookingFor("women")}
                className="accent-teal-600"
              />
              <span className="text-gray-800">Women</span>
            </label>

            <label className={optionClass}>
              <input
                type="radio"
                name="lookingFor"
                disabled={status !== "open" || joining}
                onChange={() => setLookingFor("any")}
                className="accent-teal-600"
              />
              <span className="text-gray-800">No preference</span>
            </label>
          </div>

          <button
            disabled={!ready || joining}
            onClick={handleJoin}
            className={
              ready && !joining
                ? "mt-5 w-full rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 py-3 text-white font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition"
                : "mt-5 w-full rounded-2xl bg-gray-300 py-3 font-medium text-gray-500 cursor-not-allowed opacity-70"
            }
          >
            {joining
              ? "Joining…"
              : ready
              ? "Find a Stranger"
              : status === "open"
              ? "Select your options to continue"
              : status === "entry_closed"
              ? "Entry closed for tonight"
              : status === "matching_closed"
              ? "Matching closed"
              : "Come back at 9:00 PM"}
          </button>

          {joinError ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {joinError}
            </div>
          ) : null}

          <p className="mt-4 text-xs text-gray-600">
            Conversations end at 10:00 PM sharp. Please be kind.
          </p>
        </div>
      </div>

      <footer className="pb-5 flex flex-col items-center gap-2">
        <div className="rounded-2xl border border-teal-100 bg-white/70 backdrop-blur px-4 py-2 text-xs text-gray-700 shadow-sm">
          Hi, Stranger created by Kenjo © 2026
        </div>

        {showInstall && (
          <button
            onClick={handleInstallClick}
            className="text-[11px] text-white/90 hover:text-white underline underline-offset-4"
            type="button"
          >
            Install as App
          </button>
        )}
      </footer>

      {/* iOS instructions popup */}
      {iosInstallOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setIosInstallOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-xl border border-gray-100">
            <div className="text-sm font-semibold text-gray-900">
              To install this app on your iOS:
            </div>

            <ol className="mt-3 text-sm text-gray-700 list-decimal pl-5 space-y-2">
              <li>Tap the Share button at the bottom of Safari browser.</li>
              <li>Select Add to Home Screen.</li>
              <li>Tap Add.</li>
            </ol>

            <button
              className="mt-4 w-full rounded-2xl bg-teal-600 py-2.5 text-white text-sm font-medium hover:bg-teal-700 transition"
              onClick={() => setIosInstallOpen(false)}
              type="button"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Android instructions popup */}
      {androidInstallOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setAndroidInstallOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-xl border border-gray-100">
            <div className="text-sm font-semibold text-gray-900">
              To install this app on Android:
            </div>

            <ol className="mt-3 text-sm text-gray-700 list-decimal pl-5 space-y-2">
              <li>Open this page in Chrome.</li>
              <li>Tap the ⋮ menu (top-right).</li>
              <li>Select “Add to Home screen” then “Install".</li>
            </ol>

            <button
              className="mt-4 w-full rounded-2xl bg-teal-600 py-2.5 text-white text-sm font-medium hover:bg-teal-700 transition"
              onClick={() => setAndroidInstallOpen(false)}
              type="button"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
