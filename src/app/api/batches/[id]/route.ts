import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** GET /api/batches/:id — the batch, its summary, and all violation rows. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: batch, error: be } = await supabase
    .from("batches")
    .select("*")
    .eq("id", id)
    .single();
  if (be || !batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  const { data: violations, error: ve } = await supabase
    .from("violations")
    .select("*")
    .eq("batch_id", id)
    .order("row_index", { ascending: true });
  if (ve) return NextResponse.json({ error: ve.message }, { status: 500 });

  const { data: summary } = await supabase
    .from("violation_summary")
    .select("*")
    .eq("batch_id", id)
    .maybeSingle();

  return NextResponse.json({ batch, summary, violations: violations ?? [] });
}

/** DELETE /api/batches/:id — remove a batch and its rows. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("batches").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
