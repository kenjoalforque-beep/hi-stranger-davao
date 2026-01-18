"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function WaitInner() {
  const searchParams = useSearchParams();
  const queueId = searchParams.get("qid");

  return (
    <main className="min-h-screen bg-white flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-teal-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-teal-700">Finding a stranger…</h1>
        <p className="mt-2 text-sm text-gray-700">
          Please keep this page open.
        </p>

        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-gray-700">
          Debug queue id: <span className="font-mono">{queueId ?? "-"}</span>
        </div>
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
