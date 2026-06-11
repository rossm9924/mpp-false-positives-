import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { VerdictValue } from "@/lib/types";

export const runtime = "nodejs";

const ALLOWED: VerdictValue[] = ["MATCH", "MISMATCH", "NOT_FOUND", "UNCERTAIN"];

/**
 * PATCH /api/violations/:id — manual reviewer override of a verdict.
 * Body: { verdict: VerdictValue }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const verdict = body?.verdict as VerdictValue | undefined;
  if (!verdict || !ALLOWED.includes(verdict)) {
    return NextResponse.json({ error: "Invalid verdict" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("violations")
    .update({
      verdict,
      manual_override: true,
      status: "done",
    })
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ violation: data });
}
