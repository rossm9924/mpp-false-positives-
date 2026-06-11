"use client";

import { useState } from "react";
import type { Violation, VerdictValue } from "@/lib/types";
import { isFlagged } from "@/lib/types";
import VerdictBadge from "./VerdictBadge";

const OVERRIDE_OPTIONS: VerdictValue[] = [
  "MATCH",
  "MISMATCH",
  "NOT_FOUND",
  "UNCERTAIN",
];

export default function ViolationsTable({
  violations,
  onOverride,
}: {
  violations: Violation[];
  onOverride: (id: string, verdict: VerdictValue) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <Th>Verdict</Th>
            <Th>Conf.</Th>
            <Th>Seller</Th>
            <Th>Product</Th>
            <Th>Matched on</Th>
            <Th>What the listing showed</Th>
            <Th>Override</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {violations.map((v) => (
            <Row key={v.id} v={v} onOverride={onOverride} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Row({
  v,
  onOverride,
}: {
  v: Violation;
  onOverride: (id: string, verdict: VerdictValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const flagged = isFlagged(v);
  return (
    <>
      <tr className={flagged ? "bg-flag/60" : undefined}>
        <Td>
          <VerdictBadge status={v.status} verdict={v.verdict} />
          {v.manual_override && (
            <span className="ml-1 text-[10px] text-gray-400">(manual)</span>
          )}
        </Td>
        <Td>{v.confidence != null ? `${v.confidence}%` : "—"}</Td>
        <Td className="font-medium">{v.seller_name ?? "—"}</Td>
        <Td>
          <div className="max-w-xs truncate" title={v.product_name ?? ""}>
            {v.product_name ?? "—"}
          </div>
          <div className="text-xs text-gray-400">
            {v.product_brand}
            {v.gtin ? ` · GTIN ${v.gtin}` : ""}
          </div>
        </Td>
        <Td>{v.matched_field ?? "—"}</Td>
        <Td>
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-left text-gray-600 hover:text-gray-900"
          >
            <span className="max-w-sm truncate align-middle">
              {v.on_page_title || v.reasoning || (v.error_message ? "error" : "—")}
            </span>
            <span className="ml-1 text-xs text-gray-400">
              {open ? "▲" : "▼"}
            </span>
          </button>
        </Td>
        <Td>
          <select
            value={v.verdict ?? ""}
            onChange={(e) =>
              onOverride(v.id, e.target.value as VerdictValue)
            }
            className="rounded border border-gray-300 bg-white px-1.5 py-1 text-xs"
          >
            <option value="" disabled>
              set…
            </option>
            {OVERRIDE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Td>
      </tr>
      {open && (
        <tr className={flagged ? "bg-flag/40" : "bg-gray-50"}>
          <td colSpan={7} className="px-4 py-3 text-xs text-gray-700">
            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
              <Detail label="Reasoning">{v.reasoning || "—"}</Detail>
              <Detail label="On-page title">{v.on_page_title || "—"}</Detail>
              <Detail label="Seller listing">
                {v.seller_listing_url ? (
                  <a
                    href={v.seller_listing_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    {v.seller_listing_url}
                  </a>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="Google source">
                {v.source_url ? (
                  <a
                    href={v.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    open
                  </a>
                ) : (
                  "—"
                )}
              </Detail>
              <Detail label="MAP / store price">
                {v.map != null ? `$${v.map}` : "—"} /{" "}
                {v.store_price != null ? `$${v.store_price}` : "—"}
              </Detail>
              <Detail label="SKU / MPN">
                {v.sku ?? "—"} / {v.mpn ?? "—"}
              </Detail>
              {v.error_message && (
                <Detail label="Error">
                  <span className="text-red-600">{v.error_message}</span>
                </Detail>
              )}
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 font-medium">{children}</th>;
}
function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`px-3 py-2 align-top ${className ?? ""}`}>{children}</td>;
}
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="font-medium text-gray-500">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
