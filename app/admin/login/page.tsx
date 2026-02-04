"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ token }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.ok) {
        setErr("Invalid token.");
        setLoading(false);
        return;
      }

      window.location.href = "/admin";
    } catch {
      setErr("Network error.");
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-teal-700 flex items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white/90 backdrop-blur border border-teal-100 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.25)] p-6">
        <h1
          className="text-3xl text-teal-700 tracking-wide"
          style={{ fontFamily: "var(--font-chewy)" }}
        >
          Admin Login
        </h1>

        <p className="mt-2 text-sm text-gray-600">
          Enter the admin dashboard token.
        </p>

        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ADMIN_DASH_TOKEN"
          className="mt-4 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-400"
        />

        {err ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <button
          onClick={submit}
          disabled={loading || token.trim().length < 8}
          className={
            !loading && token.trim().length >= 8
              ? "mt-4 w-full rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 py-3 text-white font-medium shadow-md hover:shadow-lg active:scale-[0.98] transition"
              : "mt-4 w-full rounded-2xl bg-gray-200 py-3 text-gray-500 font-medium cursor-not-allowed"
          }
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <button
          onClick={() => (window.location.href = "/")}
          className="mt-3 w-full rounded-2xl border border-gray-200 bg-white py-3 text-gray-700 font-medium hover:bg-gray-50 transition"
          type="button"
        >
          Back to main page
        </button>
      </div>
    </main>
  );
}
