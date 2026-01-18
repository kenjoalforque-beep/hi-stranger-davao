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

export default function Page() {
  const [phDate, setPhDate] = useState("");
  const [phTime, setPhTime] = useState("--:--:--");
  const [status, setStatus] = useState<Status>("open");


  const [iAm, setIAm] = useState<"man" | "woman" | "unspecified" | null>(null);
  const [lookingFor, setLookingFor] = useState<"men" | "women" | "any" | null>(null);

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
    //  clearInterval(poll);
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
    const t = crypto.randomUUID();
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
      setJoinError("Network error. Please try again.");
    } finally {
      setJoining(false);
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* CENTER CONTENT */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold text-teal-600">Hi, Stranger</h1>

          <p className="mt-2 text-sm text-gray-700">
            Anonymous 1-on-1 chat. No history. 9:00–10:00 PM (PH).
          </p>

          <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-gray-800">
            {phDate} {phTime} PH Time
            <div className="mt-1 text-xs text-gray-600">
              Status:{" "}
              {status === "open"
                ? "Open"
                : status === "entry_closed"
                ? "Entry closed"
                : status === "matching_closed"
                ? "Matching closed"
                : "Closed"}
            </div>
          </div>

          <p className="mt-5 text-sm font-semibold text-gray-800">I am a…</p>

          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-teal-50 transition">
              <input
                type="radio"
                name="iam"
                disabled={status !== "open" || joining}
                onChange={() => setIAm("man")}
              />
              <span className="text-gray-800">Man</span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-teal-50 transition">
              <input
                type="radio"
                name="iam"
                disabled={status !== "open" || joining}
                onChange={() => setIAm("woman")}
              />
              <span className="text-gray-800">Woman</span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-teal-50 transition">
              <input
                type="radio"
                name="iam"
                disabled={status !== "open" || joining}
                onChange={() => setIAm("unspecified")}
              />
              <span className="text-gray-800">Prefer not to say</span>
            </label>
          </div>

          <p className="mt-5 text-sm font-semibold text-gray-800">
            I want to chat with…
          </p>

          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-teal-50 transition">
              <input
                type="radio"
                name="lookingFor"
                disabled={status !== "open" || joining}
                onChange={() => setLookingFor("men")}
              />
              <span className="text-gray-800">Men</span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-teal-50 transition">
              <input
                type="radio"
                name="lookingFor"
                disabled={status !== "open" || joining}
                onChange={() => setLookingFor("women")}
              />
              <span className="text-gray-800">Women</span>
            </label>

            <label className="flex items-center gap-3 rounded-xl border border-gray-200 p-3 hover:bg-teal-50 transition">
              <input
                type="radio"
                name="lookingFor"
                disabled={status !== "open" || joining}
                onChange={() => setLookingFor("any")}
              />
              <span className="text-gray-800">No preference</span>
            </label>
          </div>

          <button
            disabled={!ready || joining}
            onClick={handleJoin}
            className={
              ready && !joining
                ? "mt-4 w-full rounded-xl bg-teal-600 py-3 font-medium text-white hover:bg-teal-700 transition"
                : "mt-4 w-full rounded-xl bg-gray-200 py-3 font-medium text-gray-500 cursor-not-allowed"
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
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {joinError}
            </div>
          ) : null}

          <p className="mt-3 text-xs text-gray-600">
            Conversations end at 10:00 PM sharp. Please be kind.
          </p>
        </div>
      </div>

      {/* TRUE FOOTER */}
      <footer className="pb-4 flex justify-center">
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-xs text-gray-700">
          Hi, Stranger created by Kenjo © 2026
        </div>
      </footer>
    </main>
  );
}
