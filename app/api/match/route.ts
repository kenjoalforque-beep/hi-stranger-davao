import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const queue_id = body?.queue_id as string | undefined;

  if (!queue_id) {
    return NextResponse.json({ ok: false, error: "missing_queue_id" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin.rpc("matchmake", { p_queue_id: queue_id });

  if (error) {
    return NextResponse.json(
      { ok: false, error: "db_error", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, room_id: data ?? null });
}
