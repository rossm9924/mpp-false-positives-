import Anthropic from "@anthropic-ai/sdk";
import type { MatchedField, VerdictValue } from "./types";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

export interface ProductForMatch {
  productName: string | null;
  brand?: string | null;
  gtin?: string | null;
  sku?: string | null;
  mpn?: string | null;
  map?: number | null;
  storePrice?: number | null;
  size?: string | null;
  color?: string | null;
  sellerName: string | null;
  sourceUrl?: string | null;
}

export interface Verdict {
  verdict: VerdictValue;
  confidence: number;
  matchedField: MatchedField;
  sellerListingUrl: string | null;
  onPageTitle: string | null;
  reasoning: string;
}

const SYSTEM = `You are a MAP (Minimum Advertised Price) compliance analyst for MAP Policy Partners.

A scanner flagged a seller for advertising a brand's product below its MAP on Google Shopping. Google Shopping often maps the wrong listing to a catalog entry, so a flagged "violation" may actually be a DIFFERENT product — a false positive. Your job is to determine, for one flagged seller, whether that seller is genuinely selling the SAME product the brand sells.

METHOD
- Use web_search to locate the named seller's OWN product page for this product (search the seller name plus the product name/brand). Then use web_fetch to read that page.
- The seller's own website is the authoritative source. Google Shopping offer lists drift over time and are JS-rendered, so do not rely on the Google catalog page alone — but you may use the provided Source URL as a hint.
- Confirm the match on hard identifiers first: GTIN / UPC, then Manufacturer Part Number (MPN), then SKU. Fall back to an exact NAME + brand + attributes (size/color/model) match only when no identifier is available on the page.

RULES
- NEVER report MATCH without having actually seen the seller's listing. Quote its on-page product title as evidence (onPageTitle).
- Books, media, and other items resold by general retailers (AbeBooks, Thriftbooks, Target, Walmart, etc.) carry their own ISBN/retailer GTIN, NOT the brand's barcode. Match these on ISBN or exact title — a different GTIN is expected and is NOT a mismatch.
- If the seller's site is inaccessible, bot-walled, or blocks crawlers (e.g. TikTok Shop, some Walmart/Amazon marketplace pages), return NOT_FOUND or UNCERTAIN — NEVER MISMATCH. Inability to verify is not evidence of a different product.
- Be conservative. If you cannot clearly confirm the exact product, do NOT claim MATCH.

VERDICTS
- MATCH: the seller's listing is unambiguously the same product (a genuine violation worth pursuing).
- MISMATCH: the seller's listing is clearly a DIFFERENT product/variant (different model, size profile, or item) — a likely FALSE POSITIVE.
- NOT_FOUND: you could not locate this product on the seller's site (delisted, or the site is inaccessible/bot-walled).
- UNCERTAIN: you found related items but cannot confirm it is the exact product.

OUTPUT
When finished, output ONLY a single JSON object (no prose around it), exactly:
{"verdict":"MATCH|MISMATCH|NOT_FOUND|UNCERTAIN","confidence":0-100,"matchedField":"GTIN|SKU|MPN|NAME|none","sellerListingUrl":"<url or null>","onPageTitle":"<exact on-page title or null>","reasoning":"<1-3 sentences citing what you saw>"}`;

function buildPrompt(p: ProductForMatch): string {
  const lines = [
    `Seller flagged: ${p.sellerName ?? "(unknown)"}`,
    `Product name (brand's catalogue): ${p.productName ?? "(unknown)"}`,
    p.brand ? `Brand: ${p.brand}` : null,
    p.gtin ? `GTIN / UPC: ${p.gtin}` : null,
    p.mpn ? `Manufacturer Part Number: ${p.mpn}` : null,
    p.sku ? `SKU: ${p.sku}` : null,
    p.size ? `Size: ${p.size}` : null,
    p.color ? `Color: ${p.color}` : null,
    p.map != null ? `MAP: $${p.map}` : null,
    p.storePrice != null ? `Flagged store price: $${p.storePrice}` : null,
    p.sourceUrl ? `Google Shopping source URL (hint only): ${p.sourceUrl}` : null,
  ].filter(Boolean);

  return `${lines.join("\n")}

Determine whether "${p.sellerName ?? "this seller"}" is genuinely selling the product above. Find their own listing, read it, and compare on GTIN/SKU/MPN/Name. Then output the JSON verdict.`;
}

const ALLOWED_VERDICTS: VerdictValue[] = [
  "MATCH",
  "MISMATCH",
  "NOT_FOUND",
  "UNCERTAIN",
];
const ALLOWED_FIELDS: MatchedField[] = ["GTIN", "SKU", "MPN", "NAME", "none"];

/** Pull the last balanced {...} object out of the model's text and parse it. */
function extractVerdict(text: string): Verdict {
  let obj: any = null;

  // Prefer a fenced ```json block if present.
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const candidates: string[] = fenced.map((m) => m[1]);

  // Otherwise scan for balanced brace spans.
  if (candidates.length === 0) {
    let depth = 0;
    let start = -1;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  for (let i = candidates.length - 1; i >= 0; i--) {
    try {
      const parsed = JSON.parse(candidates[i].trim());
      if (parsed && typeof parsed === "object" && "verdict" in parsed) {
        obj = parsed;
        break;
      }
    } catch {
      // try the next candidate
    }
  }

  if (!obj) {
    return {
      verdict: "UNCERTAIN",
      confidence: 0,
      matchedField: "none",
      sellerListingUrl: null,
      onPageTitle: null,
      reasoning:
        "Could not parse a verdict from the model output. Raw: " +
        text.slice(0, 400),
    };
  }

  const verdict: VerdictValue = ALLOWED_VERDICTS.includes(obj.verdict)
    ? obj.verdict
    : "UNCERTAIN";
  const matchedField: MatchedField = ALLOWED_FIELDS.includes(obj.matchedField)
    ? obj.matchedField
    : "none";
  let confidence = Number(obj.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  return {
    verdict,
    confidence,
    matchedField,
    sellerListingUrl:
      typeof obj.sellerListingUrl === "string" && obj.sellerListingUrl
        ? obj.sellerListingUrl
        : null,
    onPageTitle:
      typeof obj.onPageTitle === "string" && obj.onPageTitle
        ? obj.onPageTitle
        : null,
    reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "",
  };
}

/**
 * Verify one flagged seller against the brand's product using Claude with the
 * server-side web search + web fetch tools. Returns a structured verdict.
 */
export async function verifyProductMatch(
  p: ProductForMatch,
): Promise<Verdict> {
  // Anthropic server-side tools: web_search finds the seller's listing,
  // web_fetch reads it. Both run on Anthropic's infra (no client execution).
  const tools = [
    { type: "web_search_20260209", name: "web_search" },
    { type: "web_fetch_20260209", name: "web_fetch" },
  ];

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(p) },
  ];

  let response: Anthropic.Message | undefined;

  // The server runs its own tool loop; if it hits the per-request iteration cap
  // it returns stop_reason "pause_turn" and we re-send to continue.
  for (let i = 0; i < 6; i++) {
    // The request shape (adaptive thinking, output_config.effort, the
    // web_fetch_20260209 tool) follows the current Anthropic API; the cast keeps
    // this compiling against SDK type definitions that may lag the API.
    const params = {
      model: "claude-opus-4-8",
      max_tokens: 4000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools,
      messages,
    };
    response = (await anthropic.messages.create(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      params as any,
    )) as Anthropic.Message;

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    break;
  }

  if (!response) {
    throw new Error("No response from the verification model");
  }

  if (response.stop_reason === "refusal") {
    return {
      verdict: "UNCERTAIN",
      confidence: 0,
      matchedField: "none",
      sellerListingUrl: null,
      onPageTitle: null,
      reasoning: "The model declined to evaluate this item.",
    };
  }

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  return extractVerdict(text);
}
