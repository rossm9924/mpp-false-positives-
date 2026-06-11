import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseViolationsCsv } from "@/lib/csv";

export const runtime = "nodejs";

/** GET /api/batches — list batches with their verification summary. */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: batches, error } = await supabase
    .from("batches")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: summaries } = await supabase.from("violation_summary").select("*");
  const byId = new Map((summaries ?? []).map((s) => [s.batch_id, s]));

  return NextResponse.json({
    batches: (batches ?? []).map((b) => ({ ...b, summary: byId.get(b.id) ?? null })),
  });
}

/**
 * POST /api/batches — upload a violations CSV.
 * multipart/form-data: file=<csv>, account_name=<string>, channel=<Google|all>
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const accountName = (form.get("account_name") as string | null)?.trim() || "Untitled";
  const channelRaw = (form.get("channel") as string | null) ?? "Google";
  const channelFilter = channelRaw === "all" ? "" : channelRaw;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const csvText = await file.text();
  const { rows, totalRows, errors } = parseViolationsCsv(csvText, channelFilter);

  if (totalRows === 0) {
    return NextResponse.json(
      {
        error:
          "No matching rows found in the CSV. Check the file and channel filter.",
        parseErrors: errors,
      },
      { status: 400 },
    );
  }

  const { data: batch, error: batchErr } = await supabase
    .from("batches")
    .insert({
      account_name: accountName,
      source_filename: file.name,
      channel_filter: channelFilter || "all",
      total_rows: totalRows,
    })
    .select()
    .single();
  if (batchErr || !batch) {
    return NextResponse.json(
      { error: batchErr?.message ?? "Failed to create batch" },
      { status: 500 },
    );
  }

  const inserts = rows.map((r) => ({ batch_id: batch.id, ...r }));
  // Insert in chunks to stay well within payload limits.
  for (let i = 0; i < inserts.length; i += 200) {
    const { error } = await supabase
      .from("violations")
      .insert(inserts.slice(i, i + 200));
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ batch, inserted: totalRows });
}
