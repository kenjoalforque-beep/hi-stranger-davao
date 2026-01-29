import { NextResponse } from "next/server";

export async function POST() {
  // 🔴 TEMP TEST OVERRIDE — REMOVE AFTER TESTING
  return NextResponse.json({
    ok: true,
    queue_id: "TEST_QUEUE_ID",
  });
}
