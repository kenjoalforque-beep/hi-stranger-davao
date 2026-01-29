import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // 🔴 TEMP TEST OVERRIDE — REMOVE AFTER TESTING
  if (process.env.TEST_FORCE_OPEN === "true") {
    return NextResponse.json({
      ok: true,
      room_id: "test-room-" + Date.now(),
    });
  }

  // -------------------------------
  // existing REAL matching logic
  // -------------------------------

  // example placeholder (yours continues here)
  return NextResponse.json({
    ok: false,
    error: "matching_closed",
  });
}
