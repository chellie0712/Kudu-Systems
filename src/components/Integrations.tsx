"use client";

import { useActionState, useState } from "react";
import { createApiKey, type NewKeyState } from "@/app/actions/integrations";
import { API_ACCESS } from "@/lib/integrations/defs";

/** A value with a copy button; hidden behind "Show" when it is a secret. */
export function Secret({ value, hidden = true, label }: { value: string; hidden?: boolean; label: string }) {
  const [show, setShow] = useState(!hidden);
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input readOnly aria-label={label} value={show ? value : "•".repeat(32)} className="input min-w-0 flex-1 font-mono text-xs" onFocus={(e) => show && e.currentTarget.select()} />
      {hidden && (
        <button type="button" className="btn-outline py-1 text-xs" onClick={() => setShow((s) => !s)}>
          {show ? "Hide" : "Show"}
        </button>
      )}
      <button
        type="button"
        className="btn-outline py-1 text-xs"
        onClick={async () => {
          await navigator.clipboard.writeText(value).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/** Makes an API key and shows it once. */
export function NewApiKey() {
  const [state, action, pending] = useActionState<NewKeyState, FormData>(createApiKey, {});
  return (
    <div className="space-y-3">
      {state.key ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="mb-2 font-semibold text-emerald-900">Key “{state.name}” made. Copy it now: it is not shown again.</div>
          <Secret value={state.key} hidden={false} label="New API key" />
          <p className="mt-2 text-xs text-emerald-900">Keep it like a password. If it leaks, revoke it below and make a new one.</p>
        </div>
      ) : null}
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <label className="block">
          <span className="label">Name</span>
          <input name="name" className="input" placeholder="e.g. Zapier, website, Power BI" maxLength={80} required />
        </label>
        <label className="block">
          <span className="label">May</span>
          <select name="access" className="input" defaultValue="read">
            {Object.entries(API_ACCESS).map(([k, v]) => (
              <option key={k} value={k} title={v}>{k === "read" ? "Read only" : "Read and write"}</option>
            ))}
          </select>
        </label>
        <button className="btn-primary" disabled={pending}>{pending ? "Making…" : "Make key"}</button>
      </form>
      {state.error && <p className="text-sm text-kudu-700">{state.error}</p>}
    </div>
  );
}
