export type VerdictValue = "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNCERTAIN";
export type MatchedField = "GTIN" | "SKU" | "NAME" | "MPN" | "none";
export type ViolationStatus = "pending" | "verifying" | "done" | "error";

export interface Batch {
  id: string;
  account_name: string;
  source_filename: string | null;
  channel_filter: string;
  total_rows: number;
  created_by: string | null;
  created_at: string;
}

export interface Violation {
  id: string;
  batch_id: string;
  row_index: number | null;

  gtin: string | null;
  sku: string | null;
  mpn: string | null;
  product_name: string | null;
  product_brand: string | null;
  size: string | null;
  color: string | null;
  map: number | null;
  store_price: number | null;

  channel: string | null;
  seller_name: string | null;
  seller_country: string | null;
  seller_authorized: boolean | null;
  product_condition: string | null;
  source_url: string | null;
  screenshot_url: string | null;
  store_product_id: string | null;
  mpp_summary_id: string | null;
  recorded_at: string | null;
  scan_created_at: string | null;
  raw: Record<string, string> | null;

  status: ViolationStatus;
  verdict: VerdictValue | null;
  confidence: number | null;
  matched_field: MatchedField | null;
  seller_listing_url: string | null;
  on_page_title: string | null;
  reasoning: string | null;
  error_message: string | null;
  manual_override: boolean;
  verified_at: string | null;

  created_at: string;
}

export interface BatchSummary {
  batch_id: string;
  total: number;
  verified: number;
  matched: number;
  flagged: number;
  errored: number;
  pending: number;
}

/** A row whose verification did not confirm an exact match is flagged (yellow). */
export function isFlagged(v: Pick<Violation, "verdict">): boolean {
  return (
    v.verdict === "MISMATCH" ||
    v.verdict === "NOT_FOUND" ||
    v.verdict === "UNCERTAIN"
  );
}
