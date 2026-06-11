import ExcelJS from "exceljs";
import type { Batch, Violation } from "./types";
import { isFlagged } from "./types";

const YELLOW = "FFFFF3B0"; // ARGB — matches the app's flag colour

const COLUMNS: { header: string; width: number; get: (v: Violation) => unknown }[] = [
  { header: "Verdict", width: 12, get: (v) => v.verdict ?? "" },
  { header: "Flagged (false positive?)", width: 22, get: (v) => (isFlagged(v) ? "YES" : "") },
  { header: "Confidence", width: 11, get: (v) => v.confidence ?? "" },
  { header: "Matched On", width: 11, get: (v) => v.matched_field ?? "" },
  { header: "Seller Name", width: 26, get: (v) => v.seller_name ?? "" },
  { header: "Seller Listing URL", width: 50, get: (v) => v.seller_listing_url ?? "" },
  { header: "On-page Title", width: 40, get: (v) => v.on_page_title ?? "" },
  { header: "Reasoning", width: 60, get: (v) => v.reasoning ?? "" },
  { header: "Product Name", width: 40, get: (v) => v.product_name ?? "" },
  { header: "Brand", width: 18, get: (v) => v.product_brand ?? "" },
  { header: "GTIN", width: 16, get: (v) => v.gtin ?? "" },
  { header: "SKU", width: 14, get: (v) => v.sku ?? "" },
  { header: "MPN", width: 14, get: (v) => v.mpn ?? "" },
  { header: "MAP", width: 9, get: (v) => v.map ?? "" },
  { header: "Store Price", width: 11, get: (v) => v.store_price ?? "" },
  { header: "Seller Authorized", width: 16, get: (v) => v.seller_authorized ?? "" },
  { header: "Condition", width: 14, get: (v) => v.product_condition ?? "" },
  { header: "Source URL", width: 50, get: (v) => v.source_url ?? "" },
  { header: "Status", width: 10, get: (v) => v.status },
  { header: "Manual override", width: 14, get: (v) => (v.manual_override ? "YES" : "") },
];

/** Build an .xlsx workbook with non-matching rows filled yellow + a Legend tab. */
export async function buildWorkbook(
  batch: Batch,
  violations: Violation[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "MAP Policy Partners — Match Verifier";
  wb.created = new Date();

  const ws = wb.addWorksheet("Google Violations");
  ws.columns = COLUMNS.map((c) => ({ header: c.header, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: COLUMNS.length },
  };

  for (const v of violations) {
    const row = ws.addRow(COLUMNS.map((c) => c.get(v)));
    if (isFlagged(v)) {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: YELLOW },
        };
      });
    }
  }

  // ---- Legend ----
  const legend = wb.addWorksheet("Legend");
  legend.columns = [
    { header: "Field", width: 28 },
    { header: "Meaning", width: 90 },
  ];
  legend.getRow(1).font = { bold: true };
  const matched = violations.filter((v) => v.verdict === "MATCH").length;
  const flagged = violations.filter(isFlagged).length;
  const rows: [string, string][] = [
    ["Account", batch.account_name],
    ["Source file", batch.source_filename ?? ""],
    ["Generated", new Date().toISOString()],
    ["Total Google violations", String(violations.length)],
    ["Confirmed matches (genuine)", String(matched)],
    ["Flagged (yellow — likely false positives / unverified)", String(flagged)],
    ["", ""],
    ["MATCH", "Seller is genuinely selling this product — a real MAP violation."],
    ["MISMATCH", "Seller's listing is a different product — likely false positive."],
    ["NOT_FOUND", "Product not found on seller's site (delisted or bot-walled)."],
    ["UNCERTAIN", "Related items found but the exact product could not be confirmed."],
    ["", ""],
    ["Yellow fill", "Any row whose verdict is not MATCH — needs a human look."],
  ];
  for (const r of rows) legend.addRow(r);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
