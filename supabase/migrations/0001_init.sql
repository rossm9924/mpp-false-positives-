-- MPP Google-violation match verifier — schema
-- Run via the Supabase SQL editor, or `supabase db push` with the CLI.

create extension if not exists "pgcrypto";

-- A batch == one uploaded violations CSV (typically one account, e.g. "NHS").
create table if not exists public.batches (
  id              uuid primary key default gen_random_uuid(),
  account_name    text not null,
  source_filename text,
  channel_filter  text not null default 'Google',
  total_rows      integer not null default 0,
  created_by      uuid references auth.users (id) default auth.uid(),
  created_at      timestamptz not null default now()
);

-- One row per violation (we ingest the Google-channel rows by default).
create table if not exists public.violations (
  id               uuid primary key default gen_random_uuid(),
  batch_id         uuid not null references public.batches (id) on delete cascade,
  row_index        integer,

  -- product identity (from the client's catalogue)
  gtin             text,
  sku              text,
  mpn              text,                       -- Manufacturer Part Number
  product_name     text,
  product_brand    text,
  size             text,
  color            text,
  map              numeric,
  store_price      numeric,

  -- violation context (from the scan)
  channel          text,
  seller_name      text,
  seller_country   text,
  seller_authorized boolean,
  product_condition text,
  source_url       text,                       -- Google Shopping catalogue page
  screenshot_url   text,
  store_product_id text,                       -- Google catalog id
  recorded_at      text,
  scan_created_at  text,
  raw              jsonb,                       -- full original CSV row

  -- verification result
  status           text not null default 'pending',  -- pending | verifying | done | error
  verdict          text,                              -- MATCH | MISMATCH | NOT_FOUND | UNCERTAIN
  confidence       integer,                           -- 0-100
  matched_field    text,                              -- GTIN | SKU | NAME | MPN | none
  seller_listing_url text,
  on_page_title    text,
  reasoning        text,
  error_message    text,
  manual_override  boolean not null default false,
  verified_at      timestamptz,

  created_at       timestamptz not null default now()
);

create index if not exists violations_batch_idx  on public.violations (batch_id);
create index if not exists violations_status_idx on public.violations (batch_id, status);

-- A row is a "likely false positive" (flagged yellow) when verification did not
-- confirm an exact match. MATCH = the seller really is selling this product
-- (a genuine violation); everything else needs a human look.
create or replace view public.violation_summary as
select
  b.id                       as batch_id,
  count(v.*)                 as total,
  count(v.*) filter (where v.status = 'done')                          as verified,
  count(v.*) filter (where v.verdict = 'MATCH')                        as matched,
  count(v.*) filter (where v.verdict in ('MISMATCH','NOT_FOUND','UNCERTAIN')) as flagged,
  count(v.*) filter (where v.status = 'error')                         as errored,
  count(v.*) filter (where v.status in ('pending','verifying'))        as pending
from public.batches b
left join public.violations v on v.batch_id = b.id
group by b.id;

-- ---- Row Level Security ----
-- v1 access model: a single shared workspace. Any signed-in user may read and
-- write all batches/violations. (Per-account isolation can be layered on later
-- by scoping these policies to created_by / an org id.) The verification worker
-- uses the service-role key, which bypasses RLS entirely.

alter table public.batches    enable row level security;
alter table public.violations enable row level security;

drop policy if exists "authenticated full access" on public.batches;
create policy "authenticated full access" on public.batches
  for all to authenticated using (true) with check (true);

drop policy if exists "authenticated full access" on public.violations;
create policy "authenticated full access" on public.violations
  for all to authenticated using (true) with check (true);
