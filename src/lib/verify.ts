import Anthropic from "@anthropic-ai/sdk";
import type { MatchedField, VerdictValue } from "./types";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY

const BRIGHTDATA_ENABLED = !!process.env.BRIGHTDATA_API_TOKEN;

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

/** Fetch a bot-walled page through BrightData's Web Unlocker and return its text. */
async function fetchUnblocked(url: string): Promise<string> {
  const token = process.env.BRIGHTDATA_API_TOKEN;
  if (!token) throw new Error("BrightData is not configured");
  const zone = process.env.BRIGHTDATA_ZONE || "web_unlocker1";

  const res = await fetch("https://api.brightdata.com/request", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ zone, url, format: "raw" }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`BrightData ${res.status}: ${body.slice(0, 200)}`);
  }
  const html = await res.text();
  return htmlToText(html).slice(0, 12000);
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSystem(): string {
  const unblock = BRIGHTDATA_ENABLED
    ? `\n- If web_fetch fails because a page is bot-walled or blocks crawlers (e.g. TikTok Shop, some Walmart/Amazon marketplace pages), call the fetch_url_unblocked tool with the seller's product URL to retrieve it through an unblocking proxy, then judge from that content.`
    : "";

  return `You are a MAP (Minimum Advertised Price) compliance analyst for MAP Policy Partners.

A scanner flagged a seller for advertising a brand's product below its MAP on Google Shopping. Google Shopping often maps the wrong listing to a catalog entry, so a flagged "violation" may actually be a DIFFERENT product — a false positive. Your job is to determine, for one flagged seller, whether that seller is genuinely selling the SAME product the brand sells.

METHOD
- Use web_search to locate the named seller's OWN product page for this product (search the seller name plus the product name/brand). Then use web_fetch to read that page.
- The seller's own website is the authoritative source. Google Shopping offer lists drift over time and are JS-rendered, so do not rely on the Google catalog page alone — but you may use the provided Source URL as a hint.
- Confirm the match on hard identifiers first: GTIN / UPC, then Manufacturer Part Number (MPN), then SKU. Fall back to an exact NAME + brand + attributes (size/color/model) match only when no identifier is available on the page.${unblock}

RULES
- NEVER report MATCH without having actually seen the seller's listing. Quote its on-page product title as evidence (onPageTitle).
- Books, media, and other items resold by general retailers (AbeBooks, Thriftbooks, Target, Walmart, etc.) carry their own ISBN/retailer GTIN, NOT the brand's barcode. Match these on ISBN or exact title — a different GTIN is expected and is NOT a mismatch.
- If you still cannot access the seller's page after trying, return NOT_FOUND or UNCERTAIN — NEVER MISMATCH. Inability to verify is not evidence of a different product.
- ALWAYS put the seller's product page URL in sellerListingUrl whenever you find it — even if you could not read the page — so a human can review it manually.
- Be conservative. If you cannot clearly confirm the exact product, do NOT claim MATCH.

VERDICTS
- MATCH: the seller's listing is unambiguously the same product (a genuine violation worth pursuing).
- MISMATCH: the seller's listing is clearly a DIFFERENT product/variant (different model, size profile, or item) — a likely FALSE POSITIVE.
- NOT_FOUND: you could not locate this product on the seller's site (delisted, or the site is inaccessible/bot-walled).
- UNCERTAIN: you found related items but cannot confirm it is the exact product.

OUTPUT
When finished, output ONLY a single JSON object (no prose around it), exactly:
{"verdict":"MATCH|MISMATCH|NOT_FOUND|UNCERTAIN","confidence":0-100,"matchedField":"GTIN|SKU|MPN|NAME|none","sellerListingUrl":"<url or null>","onPageTitle":"<exact on-page title or null>","reasoning":"<1-3 sentences citing what you saw>"}`;
}

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
  let obj: Record<string, unknown> | null = null;

  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const candidates: string[] = fenced.map((m) => m[1]);

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
        obj = parsed as Record<string, unknown>;
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

  const verdict = ALLOWED_VERDICTS.includes(obj.verdict as VerdictValue)
    ? (obj.verdict as VerdictValue)
    : "UNCERTAIN";
  const matchedField = ALLOWED_FIELDS.includes(obj.matchedField as MatchedField)
    ? (obj.matchedField as MatchedField)
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
 * server-side web search + web fetch tools (and a BrightData unblocker tool for
 * bot-walled pages, when configured). Returns a structured verdict.
 */
export async function verifyProductMatch(p: ProductForMatch): Promise<Verdict> {
  // web_search / web_fetch run on Anthropic's infra. fetch_url_unblocked is a
  // client-side tool we execute via BrightData when a page blocks crawlers.
  const tools: unknown[] = [
    { type: "web_search_20260209", name: "web_search" },
    { type: "web_fetch_20260209", name: "web_fetch" },
  ];
  if (BRIGHTDATA_ENABLED) {
    tools.push({
      name: "fetch_url_unblocked",
      description:
        "Fetch a web page through an unblocking proxy. Use this when web_fetch fails because a page is bot-walled or blocks crawlers. Returns the page text.",
      input_schema: {
        type: "object",
        properties: {
          url: { type: "string", description: "The full URL to fetch" },
        },
        required: ["url"],
      },
    });
  }

  const system = buildSystem();
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: buildPrompt(p) },
  ];

  let response: Anthropic.Message | undefined;

  // Manual agentic loop. Server tools resolve server-side (may end a turn with
  // pause_turn at the iteration cap); our custom tool surfaces as stop_reason
  // "tool_use", which we execute and feed back.
  for (let i = 0; i < 8; i++) {
    // Request shape (adaptive thinking, output_config.effort, the
    // web_fetch_20260209 tool) follows the current Anthropic API; the cast keeps
    // this compiling against SDK type definitions that may lag the API.
    const params = {
      model: "claude-opus-4-8",
      max_tokens: 4000,
      system,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      tools,
      messages,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response = (await anthropic.messages.create(params as any)) as Anthropic.Message;

    if (response.stop_reason === "tool_use") {
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        // Every tool_use id must get a result, or the next call 400s.
        if (block.name === "fetch_url_unblocked") {
          const url = (block.input as { url?: string })?.url ?? "";
          try {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: url ? await fetchUnblocked(url) : "No URL provided.",
            });
          } catch (e) {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: e instanceof Error ? e.message : String(e),
              is_error: true,
            });
          }
        } else {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Unsupported tool: ${block.name}`,
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
      continue;
    }

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
