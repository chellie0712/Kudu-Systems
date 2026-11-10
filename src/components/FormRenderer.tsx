"use client";

import { useState, useTransition } from "react";
import type { FormField } from "@/lib/forms";
import { SignaturePad } from "./JobCardEditors";

export type FormResult = { errors?: Record<string, string>; error?: string } | void;

/**
 * Shows a built form and sends it to `action`. Values are kept when the server finds a problem,
 * which is shown under the field. `hidden` adds hidden inputs (form id, links, spam stamp).
 */
export function FormRenderer({
  fields,
  action,
  hidden,
  submitLabel = "Submit",
  honeypot = false,
}: {
  fields: FormField[];
  action: (fd: FormData) => Promise<FormResult>;
  hidden: Record<string, string>;
  submitLabel?: string;
  honeypot?: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      noValidate={false}
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await action(fd);
          setErrors(r?.errors ?? {});
          setError(r?.error ?? (r?.errors && Object.keys(r.errors).length ? "Please check the answers marked in red." : ""));
        });
      }}
    >
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {honeypot && (
        // Bots fill in every field; people never see this one.
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>Leave this empty <input name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>
      )}
      {fields.map((f) => {
        const name = `f_${f.id}`;
        const err = errors[f.id];
        const label = (
          <span className="label">
            {f.label}
            {f.required && <span className="text-kudu-600"> *</span>}
          </span>
        );
        const help = f.help && <span className="mt-0.5 block text-xs text-charcoal-500">{f.help}</span>;
        const errEl = err && <span className="mt-1 block text-sm text-kudu-700">{err}</span>;
        const cls = `input ${err ? "border-kudu-600" : ""}`;
        if (f.type === "heading")
          return (
            <div key={f.id} className="border-b border-charcoal-200 pb-1 pt-2">
              <h3 className="text-lg font-bold text-charcoal-800">{f.label}</h3>
              {f.help && <p className="text-sm text-charcoal-500">{f.help}</p>}
            </div>
          );
        if (f.type === "signature")
          return (
            <div key={f.id}>
              <SignaturePad name={name} label={`${f.label}${f.required ? " *" : ""}`} />
              {help}
              {errEl}
            </div>
          );
        if (f.type === "radio" || f.type === "checkboxes" || f.type === "yesno") {
          const options = f.type === "yesno" ? ["Yes", "No"] : f.options;
          return (
            <fieldset key={f.id}>
              <legend className="label">
                {f.label}
                {f.required && <span className="text-kudu-600"> *</span>}
              </legend>
              {help}
              <div className={`mt-1 flex flex-wrap gap-x-5 gap-y-2 ${f.type === "yesno" ? "" : "sm:grid sm:grid-cols-2"}`}>
                {options.map((o) => (
                  <label key={o} className="flex items-center gap-2 text-sm">
                    <input type={f.type === "checkboxes" ? "checkbox" : "radio"} name={name} value={o} required={f.required && f.type !== "checkboxes"} className="h-4 w-4 accent-kudu-600" />
                    {o}
                  </label>
                ))}
              </div>
              {errEl}
            </fieldset>
          );
        }
        return (
          <label key={f.id} className="block">
            {label}
            {f.type === "textarea" ? (
              <textarea name={name} rows={4} required={f.required} maxLength={5000} className={cls} />
            ) : f.type === "select" ? (
              <select name={name} required={f.required} defaultValue="" className={cls}>
                <option value="">Choose…</option>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                name={name}
                required={f.required}
                maxLength={500}
                className={cls}
                type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : f.type === "date" ? "date" : "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                autoComplete={f.mapTo === "email" ? "email" : f.mapTo === "phone" ? "tel" : f.mapTo === "contactPerson" ? "name" : f.mapTo === "name" ? "organization" : f.mapTo === "address" ? "street-address" : undefined}
              />
            )}
            {help}
            {errEl}
          </label>
        );
      })}
      {error && <p className="rounded-md bg-kudu-50 p-3 text-sm text-kudu-800">{error}</p>}
      <button className="btn-primary" disabled={pending}>{pending ? "Sending…" : submitLabel}</button>
    </form>
  );
}
