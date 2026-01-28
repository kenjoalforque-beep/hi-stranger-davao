import { NextResponse } from "next/server";
import { manilaNowParts } from "@/lib/time";

export async function GET() {
  const t = manilaNowParts();

  // ✅ Frontend expects ONLY these 3
  let state: "open" | "entry_closed" | "closed" = "closed";

  // Rules (PH time):
  // - 21:00–21:44 => open
  // - 21:45–21:59 => entry_closed (UI label: "Matching closed")
  // - otherwise => closed
  const hh = t.h;
  const mm = t.m;

  const isAfterOrAt = (H: number, M: number) =>
    hh > H || (hh === H && mm >= M);

  const isBefore = (H: number, M: number) =>
    hh < H || (hh === H && mm < M);

  const within9to10 = isAfterOrAt(21, 0) && isBefore(22, 0);
  const before945 = isBefore(21, 45);

  if (within9to10) {
    state = before945 ? "open" : "entry_closed";
  } else {
    state = "closed";
  }

  return NextResponse.json({
    ok: true,
    state,
    manila_time: `${String(t.h).padStart(2, "0")}:${String(t.m).padStart(
      2,
      "0"
    )}:${String(t.s).padStart(2, "0")}`,
    rules: {
      open: "21:00–22:00",
      last_entry_before: "21:45",
      hard_close: "22:00",
      note: 'Between 21:45–21:59, state is "entry_closed" (UI: Matching closed).',
    },
  });
}
