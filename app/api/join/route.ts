import { NextResponse } from "next/server";
import { canEnterNow, isWithinOpenHour, canMatchNow } from "@/lib/time";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type IAm = "man" | "woman" | "unspecified";
type LookingFor = "men" | "women" | "any";

function isIAm(v: any): v is IAm {
  return v === "man" || v === "woman" || v === "unspecified";
}

function isLookingFor(v: any): v is LookingFor {
  return v === "men" || v === "women" || v === "any";
}

export async function POST(req: Request) {
  // DEV OVERRIDE: allow joining anytime locally
  if (process.env.NODE_ENV !== "development") {
    if (!isWithinOpenHour()) {
      return NextResponse.json({ ok: false, error: "closed" }, { status: 403 });
    }
    if (!canEnterNow()) {
      return NextResponse.json(
        { ok: false, error: canMatchNow() ? "entry_closed" : "matching_closed" },
        { status: 403 }
      );
    }
  }

  const body = await req.json().catch(() => null);

  const iam = body?.iam;
  const lookingFor = body?.lookingFor;
  const user_token = body?.user_token; // <-- coming from browser sessionStorage

  if (!isIAm(iam) || !isLookingFor(lookingFor) || typeof user_token !== "string" || user_token.length < 10) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("queue")
    .insert({
      user_token,              // ✅ CRITICAL: store browser token
      iam,
      looking_for: lookingFor,
      active: true,
      self_end_count: 0,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, queue_id: data.id });
}
