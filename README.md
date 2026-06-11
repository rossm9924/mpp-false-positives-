# MPP — Google Shopping Violation Match Verifier

A user-facing web app that automates the manual "check each Google violation against
the seller's own listing" workflow. Upload a MAP violations CSV; for every flagged
seller the app finds their product listing, reads it, and confirms whether they're
genuinely selling the brand's product (matching on **GTIN / SKU / Manufacturer Part
Number / Name**). Rows that **don't** confirm an exact match are highlighted in
**yellow** — the likely **false positives**.

Built for **Vercel** (Next.js App Router) + **Supabase** (Postgres, Auth) + the
**Anthropic API** (Claude with server-side web search + web fetch as the verification
engine).

---

## Why this exists

Google Shopping frequently maps the wrong listing to a catalog entry, so a flagged
"violation" can actually be a different product. Verifying each one by hand (open the
Google page → find the seller → open their site → compare identifiers) is slow and
doesn't scale. This tool does that comparison automatically and conservatively, and
flags everything it can't confirm for a human to review.

### Verdicts

| Verdict | Meaning | Flagged yellow? |
|---|---|---|
| `MATCH` | Seller is genuinely selling this product — a real MAP violation. | no |
| `MISMATCH` | Seller's listing is a different product — likely **false positive**. | yes |
| `NOT_FOUND` | Product not found on the seller's site (delisted or bot-walled). | yes |
| `UNCERTAIN` | Related items found, but the exact product couldn't be confirmed. | yes |

The engine is deliberately conservative — it never claims `MATCH` without quoting the
seller's actual on-page title, treats inaccessible/bot-walled sites as `NOT_FOUND`
(not `MISMATCH`), and knows that resold books/media carry their own ISBN rather than
the brand's barcode.

---

## How it works

1. **Upload** a violations CSV (the `product_prices_*.csv` export). The app parses it,
   keeps the Google-channel rows by default, and stores them as a **batch**.
2. **Verify** — a serverless worker processes the rows a few at a time. For each row it
   calls Claude (`claude-opus-4-8`) with the **web search** and **web fetch** server
   tools, which locate and read the seller's listing, then return a structured verdict
   (verdict, confidence, matched field, seller URL, on-page title, reasoning). The UI
   polls and shows live progress.
3. **Review** — a table shows every violation; non-matches are highlighted yellow.
   Expand any row for the evidence, and override a verdict manually if needed.
4. **Export** — download an `.xlsx` with the non-matching rows filled yellow and a
   Legend tab, reproducing the original spreadsheet deliverable.

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run the schema: open **SQL Editor** and paste `supabase/migrations/0001_init.sql`
   (or `supabase db push` with the CLI).
3. **Auth**: the app uses passwordless **magic-link** sign-in. Under
   **Authentication → URL Configuration**, add your site URL and
   `…/auth/callback` to the redirect allow-list (e.g. `http://localhost:3000/auth/callback`
   and `https://your-app.vercel.app/auth/callback`). Supabase's built-in email works
   for testing; wire up a custom SMTP provider for production volume.
4. Grab the **Project URL**, **anon key**, and **service-role key** from
   **Project Settings → API**.

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=…
NEXT_PUBLIC_SUPABASE_ANON_KEY=…
SUPABASE_SERVICE_ROLE_KEY=…        # server only — never exposed to the browser
ANTHROPIC_API_KEY=sk-ant-…
NEXT_PUBLIC_SITE_URL=http://localhost:3000
VERIFY_BATCH_SIZE=3
```

### 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, sign in with your email, and upload a CSV.

### 4. Deploy to Vercel

1. Push this repo and import it in Vercel.
2. Add the same environment variables in the Vercel project settings (set
   `NEXT_PUBLIC_SITE_URL` to your production domain).
3. Deploy.

---

## Notes & limits

- **Function timeouts.** Verification calls the model with live web search/fetch and can
  take ~30–60s per row. The worker processes `VERIFY_BATCH_SIZE` rows per request and the
  client polls until done. On **Vercel Hobby** functions cap at **60s** — keep
  `VERIFY_BATCH_SIZE` small (2–3). On **Pro**, the routes set `maxDuration = 300`, so you
  can raise it. For very large batches consider moving verification to a queue / Supabase
  Edge Function — the worker is already structured as "process the next N pending rows".
- **Cost.** Each row is one Claude request with web tools; budget accordingly for large
  batches.
- **Access model (v1).** A single shared workspace: any signed-in user can see all
  batches. Row Level Security is enabled; the policies can be scoped to an account/org
  later for per-client isolation (the schema keeps `created_by` for this).
- **CSV format.** Header matching is tolerant (case/spacing-insensitive) and expects the
  columns from the MAP violations export: `GTIN, SKU, Product Name, Manufacturer Part
  Number, Product Brand, MAP, Store Price, Seller Name, Channel, Source URL, …`.

## Project layout

```
supabase/migrations/0001_init.sql   schema (batches, violations, summary view, RLS)
src/lib/csv.ts                       violations CSV → rows
src/lib/verify.ts                    Claude verification engine (web search + fetch)
src/lib/export.ts                    .xlsx with yellow fill + Legend (ExcelJS)
src/app/api/batches/…                upload, list, fetch, verify worker, export
src/app/api/violations/[id]          manual verdict override
src/app/page.tsx                     dashboard + upload
src/app/batches/[id]/page.tsx        review screen (verify, filter, export)
```
