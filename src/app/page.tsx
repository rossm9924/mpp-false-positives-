"use client";

import useSWR from "swr";
import Link from "next/link";
import UploadCard from "@/components/UploadCard";
import type { Batch, BatchSummary } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type BatchWithSummary = Batch & { summary: BatchSummary | null };

export default function Dashboard() {
  const { data, mutate, isLoading } = useSWR<{ batches: BatchWithSummary[] }>(
    "/api/batches",
    fetcher,
  );

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="text-xl font-semibold">Google Shopping violations</h1>
      <p className="mt-1 text-sm text-gray-500">
        Upload a violations export. Each flagged seller is checked against the
        product on its own site — likely false positives are highlighted in
        yellow.
      </p>

      <div className="mt-6">
        <UploadCard onUploaded={() => mutate()} />
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Batches
      </h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
        {isLoading && (
          <p className="px-4 py-6 text-sm text-gray-500">Loading…</p>
        )}
        {!isLoading && (data?.batches?.length ?? 0) === 0 && (
          <p className="px-4 py-6 text-sm text-gray-500">
            No batches yet. Upload a CSV to get started.
          </p>
        )}
        {(data?.batches ?? []).map((b) => {
          const s = b.summary;
          return (
            <Link
              key={b.id}
              href={`/batches/${b.id}`}
              className="flex items-center justify-between border-b border-gray-100 px-4 py-3 last:border-0 hover:bg-gray-50"
            >
              <div>
                <div className="text-sm font-medium">{b.account_name}</div>
                <div className="text-xs text-gray-500">
                  {b.source_filename} · {new Date(b.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center gap-4 text-xs">
                {s && (
                  <>
                    <Stat label="rows" value={s.total} />
                    <Stat label="verified" value={s.verified} />
                    <Stat label="matched" value={s.matched} tone="green" />
                    <Stat label="flagged" value={s.flagged} tone="yellow" />
                  </>
                )}
                <span className="text-gray-400">→</span>
              </div>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "green" | "yellow";
}) {
  const color =
    tone === "green"
      ? "text-green-700"
      : tone === "yellow"
        ? "text-yellow-700"
        : "text-gray-700";
  return (
    <div className="text-center">
      <div className={`font-semibold ${color}`}>{value}</div>
      <div className="text-gray-400">{label}</div>
    </div>
  );
}
