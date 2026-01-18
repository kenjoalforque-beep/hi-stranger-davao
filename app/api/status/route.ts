import { NextResponse } from "next/server";
import { manilaNowParts, isWithinOpenHour, canEnterNow, canMatchNow } from "@/lib/time";

export async function GET() {
  const t = manilaNowParts();

  let state: "open" | "entry_closed" | "matching_closed" | "closed" = "closed";

  if (isWithinOpenHour()) {
    if (canEnterNow()) state = "open";
    else if (canMatchNow()) state = "entry_closed";
    else state = "matching_closed";
  } else {
    state = "closed";
  }

  return NextResponse.json({
    ok: true,
    state,
    manila_time: `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(2, "0")}:${String(t.s).padStart(2, "0")}`,
    rules: {
      open: "21:00–22:00",
      last_entry_before: "21:45",
      matching_before: "21:50",
      hard_close: "22:00",
    },
  });
}

