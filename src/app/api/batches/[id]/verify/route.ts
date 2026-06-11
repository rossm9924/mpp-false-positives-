import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyProductMatch } from "@/lib/verify";
import type { Violation } from "@/lib/types";

export const runtime = "nodejs";
// Verification calls the model with web search/fetch and can take ~30-60s per row.
// On Vercel Hobby the cap is 60s; on Pro raise this. Keep VERIFY_BATCH_SIZE small.
export const maxDuration = 300;

/**
 * POST /api/batches/:id/verify
 * Verifies the next chunk of pending rows and returns progress. The client
 * polls this endpoint until `remaining` reaches 0 (serverless-friendly worker).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const batchSize = Math.max(1, Number(process.env.VERIFY_BATCH_SIZE ?? "3"));

  // Claim the next chunk of pending rows.
  const { data: pending, error } = await admin
    .from("violations")
    .select("*")
    .eq("batch_id", id)
    .eq("status", "pending")
    .order("row_index", { ascending: true })
    .limit(batchSize);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (pending ?? []) as Violation[];

  if (rows.length > 0) {
    await admin
      .from("violations")
      .update({ status: "verifying" })
      .in(
        "id",
        rows.map((r) => r.id),
      );
  }

  await Promise.all(
    rows.map(async (row) => {
      try {
        const verdict = await verifyProductMatch({
          productName: row.product_name,
          brand: row.product_brand,
          gtin: row.gtin,
          sku: row.sku,
          mpn: row.mpn,
          map: row.map,
          storePrice: row.store_price,
          size: row.size,
          color: row.color,
          sellerName: row.seller_name,
          sourceUrl: row.source_url,
        });
        await admin
          .from("violations")
          .update({
            status: "done",
            verdict: verdict.verdict,
            confidence: verdict.confidence,
            matched_field: verdict.matchedField,
            seller_listing_url: verdict.sellerListingUrl,
            on_page_title: verdict.onPageTitle,
            reasoning: verdict.reasoning,
            error_message: null,
            verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      } catch (e) {
        await admin
          .from("violations")
          .update({
            status: "error",
            error_message: e instanceof Error ? e.message : String(e),
            verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);
      }
    }),
  );

  // Report remaining work so the client knows whether to poll again.
  const { count: remaining } = await admin
    .from("violations")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", id)
    .in("status", ["pending", "verifying"]);

  return NextResponse.json({
    processed: rows.length,
    remaining: remaining ?? 0,
  });
}
