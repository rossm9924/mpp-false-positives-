import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildWorkbook } from "@/lib/export";
import type { Batch, Violation } from "@/lib/types";

export const runtime = "nodejs";

/** GET /api/batches/:id/export — download an .xlsx with non-matches filled yellow. */
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

  const { data: batch } = await supabase
    .from("batches")
    .select("*")
    .eq("id", id)
    .single();
  if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  const { data: violations } = await supabase
    .from("violations")
    .select("*")
    .eq("batch_id", id)
    .order("row_index", { ascending: true });

  const buffer = await buildWorkbook(batch as Batch, (violations ?? []) as Violation[]);

  const safe = (batch.account_name as string).replace(/[^a-z0-9]+/gi, "_");
  const filename = `${safe}_Google_Violations.xlsx`;

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
