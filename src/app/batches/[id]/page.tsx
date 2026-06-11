"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import ViolationsTable from "@/components/ViolationsTable";
import type { Batch, BatchSummary, Violation, VerdictValue } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface BatchResponse {
  batch: Batch;
  summary: BatchSummary | null;
  violations: Violation[];
}

type Filter = "all" | "flagged" | "matched" | "pending";

export default function BatchPage() {
  const { id } = useParams<{ id: string }>();
  const { data, mutate, isLoading } = useSWR<BatchResponse>(
    id ? `/api/batches/${id}` : null,
    fetcher,
  );

  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);
  const [filter, setFilter] = useState<Filter>("all");

  async function runVerification() {
    if (running) {
      cancelRef.current = true;
      return;
    }
    setRunning(true);
    cancelRef.current = false;
    try {
      // Worker loop: process a chunk, refresh, repeat until nothing's left.
      for (let guard = 0; guard < 1000; guard++) {
        if (cancelRef.current) break;
        const res = await fetch(`/api/batches/${id}/verify`, { method: "POST" });
        const json = await res.json();
        await mutate();
        if (!res.ok) break;
        if ((json.remaining ?? 0) <= 0) break;
      }
    } finally {
      setRunning(false);
      cancelRef.current = false;
      mutate();
    }
  }

  async function override(violationId: string, verdict: VerdictValue) {
    await fetch(`/api/violations/${violationId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verdict }),
    });
    mutate();
  }

  const s = data?.summary;
  const violations = data?.violations ?? [];
  const filtered = violations.filter((v) => {
    if (filter === "flagged")
      return ["MISMATCH", "NOT_FOUND", "UNCERTAIN"].includes(v.verdict ?? "");
    if (filter === "matched") return v.verdict === "MATCH";
    if (filter === "pending")
      return v.status === "pending" || v.status === "verifying";
    return true;
  });

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
        ← Batches
      </Link>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {data?.batch.account_name ?? "Batch"}
          </h1>
          <p className="text-sm text-gray-500">
            {data?.batch.source_filename}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runVerification}
            disabled={isLoading || (s != null && s.pending === 0 && !running)}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {running
              ? "Stop"
              : s && s.pending < s.total
                ? "Resume verification"
                : "Verify all"}
          </button>
          <a
            href={`/api/batches/${id}/export`}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Export .xlsx
          </a>
        </div>
      </div>

      {s && (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Card label="Total" value={s.total} />
          <Card label="Verified" value={s.verified} />
          <Card label="Matched" value={s.matched} tone="green" />
          <Card label="Flagged" value={s.flagged} tone="yellow" />
          <Card label="Pending" value={s.pending} />
        </div>
      )}

      {running && s && (
        <div className="mt-4">
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
            <div
              className="h-full bg-gray-900 transition-all"
              style={{
                width: `${s.total ? Math.round((s.verified / s.total) * 100) : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Verifying… {s.verified}/{s.total}. You can leave this running; it
            processes a few at a time.
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 text-sm">
        {(["all", "flagged", "matched", "pending"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f
                ? "bg-gray-900 text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">
          {filtered.length} rows
        </span>
      </div>

      <div className="mt-3">
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <ViolationsTable violations={filtered} onOverride={override} />
        )}
      </div>
    </main>
  );
}

function Card({
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
        : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className={`text-2xl font-semibold ${color}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-gray-400">
        {label}
      </div>
    </div>
  );
}
