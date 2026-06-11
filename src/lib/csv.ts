import Papa from "papaparse";

export interface ParsedViolationRow {
  row_index: number;
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
  raw: Record<string, string>;
}

export interface ParseResult {
  rows: ParsedViolationRow[];
  totalRows: number;
  skippedChannel: number;
  errors: string[];
}

/** Case/space/punctuation-insensitive header lookup. */
function pick(row: Record<string, string>, ...names: string[]): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const map = new Map<string, string>();
  for (const key of Object.keys(row)) map.set(norm(key), key);
  for (const n of names) {
    const key = map.get(norm(n));
    if (key !== undefined) {
      const v = (row[key] ?? "").trim();
      return v === "" ? null : v;
    }
  }
  return null;
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(v: string | null): boolean | null {
  if (v === null) return null;
  const t = v.trim().toLowerCase();
  if (t === "true" || t === "yes" || t === "1") return true;
  if (t === "false" || t === "no" || t === "0") return false;
  return null;
}

/**
 * Parse a MAP violations CSV (the `product_prices_*.csv` export shape).
 * By default keeps only the rows for the given channel (Google).
 */
export function parseViolationsCsv(
  csvText: string,
  channelFilter = "Google",
): ParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
  });

  const errors = parsed.errors.map((e) => `${e.type}: ${e.message} (row ${e.row})`);
  const rows: ParsedViolationRow[] = [];
  let skippedChannel = 0;

  parsed.data.forEach((raw, i) => {
    const channel = pick(raw, "Channel");
    if (
      channelFilter &&
      channel &&
      channel.toLowerCase() !== channelFilter.toLowerCase()
    ) {
      skippedChannel++;
      return;
    }
    // Skip wholly empty objects papaparse sometimes emits.
    if (!pick(raw, "Product Name", "Seller Name", "GTIN", "SKU")) return;

    rows.push({
      row_index: i,
      gtin: pick(raw, "GTIN"),
      sku: pick(raw, "SKU"),
      mpn: pick(raw, "Manufacturer Part Number", "MPN"),
      product_name: pick(raw, "Product Name", "Title"),
      product_brand: pick(raw, "Product Brand", "Brand"),
      size: pick(raw, "Size"),
      color: pick(raw, "Color", "Colour"),
      map: num(pick(raw, "MAP", "MAP Price US", "MAP Price")),
      store_price: num(pick(raw, "Store Price", "Add To Cart Price")),
      channel,
      seller_name: pick(raw, "Seller Name"),
      seller_country: pick(raw, "Seller Country"),
      seller_authorized: bool(pick(raw, "Seller Authorized")),
      product_condition: pick(raw, "Product Condition"),
      source_url: pick(raw, "Source URL", "Source"),
      screenshot_url: pick(raw, "Screenshot URL"),
      store_product_id: pick(raw, "Store Product ID", "Google Shopping ID", "Google Product ID"),
      mpp_summary_id: pick(
        raw,
        "Product Summary ID",
        "Summary ID",
        "Account Seller User Product Summary ID",
        "Account Seller User Product Summary",
        "MPP Summary ID",
        "Flagged Issue ID",
      ),
      recorded_at: pick(raw, "Recorded At"),
      scan_created_at: pick(raw, "Scan Created At"),
      raw,
    });
  });

  return {
    rows,
    totalRows: rows.length,
    skippedChannel,
    errors,
  };
}
