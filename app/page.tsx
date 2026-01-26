"use client";

import { useEffect, useState } from "react";

type Status = "open" | "entry_closed" | "matching_closed" | "closed";

function getPhilippineNow() {
  const now = new Date();

  const tf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = tf.formatToParts(now).reduce<Record<string, string>>((a, p) => {
    if (p.type !== "literal") a[p.type] = p.value;
    return a;
  }, {});

  const time = `${parts.hour}:${parts.minute}:${parts.second}`;

  const df = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    month: "long",
    day: "2-digit",
    year: "numeric",
  });

  return { date: df.format(now), time };
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

export default function Page() {
  const [phDate, setPhDate] = useState("");
  const [phTime, setPhTime] = useState("--:--:--");
  const [status, setStatus] = useState<Status>("open");

  const [iAm, setIAm] = useState<"man" | "woman" | "unspecified" | null>(null);
  const [lookingFor, setLookingFor] = useState<"men" | "women" | "any" | null>(
    null
  );

  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const ready = status === "open" && iAm !== null && lookingFor !== null;

  useEffect(() => {
    function tick() {
      const t = getPhilippineNow();
      setPhDate(t.date);
      setPhTime(t.time);
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

    tick();
    // loadStatus();

    const clock = setInterval(tick, 1000);
    // const poll = setInterval(loadStatus, 5000);

    return () => {
      clearInterval(clock);
      // clearInterval(poll);
    };
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
          user_token, // ✅ ADD THIS
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

      // store locally in case we want to display/use in /wait later
      sessionStorage.setItem("iam", String(iAm));
      sessionStorage.setItem("lookingFor", String(lookingFor));

      window.location.href = `/wait?qid=${data.queue_id}`;
    } catch {
      setJoinError("Something blocked the request. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  const optionClass =
    "flex items-center gap-3 rounded-2xl border border-gray-200 bg-white/70 backdrop-blur px-4 py-3 shadow-sm hover:shadow-md hover:border-teal-300 hover:bg-white transition";

  return (
    <main className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-white flex flex-col">
      {/* CENTER CONTENT */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] p-6">
          {/* Logo / App name */}
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

          {/* Time / status card */}
          <div className="mt-4 rounded-2xl border border-teal-100 bg-white/70 backdrop-blur p-4 shadow-sm">
            <div className="text-sm text-gray-800">
              <span className="font-medium">{phDate}</span>{" "}
              <span className="font-mono">{phTime}</span>{" "}
              <span className="text-gray-600">PH Time</span>
            </div>

            <div className="mt-1 text-xs text-gray-600">
              Status:{" "}
              <span className="font-medium text-teal-700">
                {status === "open"
                  ? "Open"
                  : status === "entry_closed"
                  ? "Entry closed"
                  : status === "matching_closed"
                  ? "Matching closed"
                  : "Closed"}
              </span>
            </div>
          </div>

          {/* Selections */}
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

          {/* CTA */}
          <button
            disabled={!ready || joining}
            onClick={handleJoin}
            className={
              ready && !joining
                ? "mt-5 w-full rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 py-3 text-white font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition"
                : "mt-5 w-full rounded-2xl bg-gray-200 py-3 font-medium text-gray-500 cursor-not-allowed"
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

          {/* Error */}
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

      {/* TRUE FOOTER */}
      <footer className="pb-5 flex justify-center">
        <div className="rounded-2xl border border-teal-100 bg-white/70 backdrop-blur px-4 py-2 text-xs text-gray-700 shadow-sm">
          Hi, Stranger created by Kenjo © 2026
        </div>
      </footer>
    </main>
  );
}
