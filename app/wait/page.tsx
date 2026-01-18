"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function WaitInner() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get("qid");

  useEffect(() => {
    if (!queueId) return;

    // Poll matching API
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ queue_id: queueId }),
        });

        const data = await res.json().catch(() => null);

        if (res.ok && data?.ok && data?.room_id) {
          clearInterval(interval);
          window.location.href = `/room/${data.room_id}`;
        }
      } catch {
        // ignore network hiccups
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [queueId]);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white p-6 shadow-sm text-center">
        <h1 className="text-2xl font-semibold text-teal-700">
          Finding a stranger…
        </h1>
        <p className="mt-2 text-sm text-gray-700">
          Please keep this page open.
        </p>
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
