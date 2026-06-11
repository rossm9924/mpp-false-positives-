"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function UploadCard({ onUploaded }: { onUploaded?: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [accountName, setAccountName] = useState("");
  const [channel, setChannel] = useState("Google");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("account_name", accountName || file.name.replace(/\.csv$/i, ""));
    fd.append("channel", channel);

    const res = await fetch("/api/batches", { method: "POST", body: fd });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Upload failed");
      return;
    }
    onUploaded?.();
    router.push(`/batches/${json.batch.id}`);
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-lg border border-gray-200 bg-white p-5"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600">
            Account
          </label>
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="e.g. NHS"
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          />
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600">
            Channel
          </label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
          >
            <option value="Google">Google only</option>
            <option value="all">All channels</option>
          </select>
        </div>
        <div className="sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600">
            Violations CSV
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-1 w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
          />
        </div>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={!file || busy}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload & create batch"}
        </button>
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </form>
  );
}
