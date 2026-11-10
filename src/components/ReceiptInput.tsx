"use client";

import { useState } from "react";
import { compress } from "./JobCardEditors";

/** Photo of a till slip or invoice, downscaled in the browser and sent as a data URL. */
export function ReceiptInput({ hasExisting = false }: { hasExisting?: boolean }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2 text-sm">
      <input type="hidden" name="receipt" value={value} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-outline cursor-pointer py-1.5">
          {busy ? "Reading…" : value ? "Change photo" : hasExisting ? "Replace receipt" : "Add receipt photo"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                setValue(await compress(file, 1400, 0.7));
              } catch {
                setError("That file could not be read as a photo.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {value && <button type="button" className="text-charcoal-500 hover:text-kudu-600" onClick={() => setValue("")}>Remove</button>}
        {hasExisting && !value && (
          <label className="flex items-center gap-1 text-charcoal-500">
            <input type="checkbox" name="removeReceipt" /> Remove the current receipt
          </label>
        )}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {value && <img src={value} alt="Receipt preview" className="max-h-48 rounded border border-charcoal-200" />}
      {error && <p className="text-kudu-700">{error}</p>}
    </div>
  );
}
