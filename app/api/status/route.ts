import { NextResponse } from "next/server";

export async function GET() {
  // 🔴 TEMPORARY FORCE OPEN — REMOVE AFTER TESTING
  return NextResponse.json({
    ok: true,
    state: "open",
    manila_time: "TEST",
  });
}
