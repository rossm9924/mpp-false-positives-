import type { ViolationStatus, VerdictValue } from "@/lib/types";

const VERDICT_STYLES: Record<VerdictValue, string> = {
  MATCH: "bg-green-100 text-green-800",
  MISMATCH: "bg-red-100 text-red-800",
  NOT_FOUND: "bg-amber-100 text-amber-800",
  UNCERTAIN: "bg-amber-100 text-amber-800",
};

export default function VerdictBadge({
  status,
  verdict,
}: {
  status: ViolationStatus;
  verdict: VerdictValue | null;
}) {
  if (status === "pending")
    return <Pill className="bg-gray-100 text-gray-500">pending</Pill>;
  if (status === "verifying")
    return <Pill className="bg-blue-100 text-blue-700">verifying…</Pill>;
  if (status === "error")
    return <Pill className="bg-red-100 text-red-700">error</Pill>;
  if (!verdict) return <Pill className="bg-gray-100 text-gray-500">—</Pill>;
  return <Pill className={VERDICT_STYLES[verdict]}>{verdict}</Pill>;
}

function Pill({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}
