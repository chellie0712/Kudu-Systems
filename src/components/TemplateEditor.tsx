"use client";

import { useRef, useState } from "react";
import { BLOCKS, DOC_SUBJECTS, exampleData, groupsFor, mergeFields, unknownFields, type DocItem, type DocSubject } from "@/lib/documents/defs";
import { DocBody } from "./DocBody";

const SAMPLE_ITEMS: DocItem[] = [
  { description: "General pest control: kitchen and storeroom", quantity: 1, unit: "", unitPrice: 85000 },
  { description: "Rodent bait stations (monthly service)", quantity: 6, unit: "stations", unitPrice: 2500 },
];

/**
 * Template text with a field list (click to insert at the cursor) and a live preview filled with
 * example values. Sends appliesTo, title and body with the surrounding form.
 */
export function TemplateEditor({ initial, companyName }: { initial: { appliesTo: DocSubject; title: string; body: string }; companyName: string }) {
  const [appliesTo, setAppliesTo] = useState<DocSubject>(initial.appliesTo);
  const [title, setTitle] = useState(initial.title);
  const [body, setBody] = useState(initial.body);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const area = useRef<HTMLTextAreaElement>(null);

  const insert = (text: string) => {
    const el = area.current;
    if (!el) return setBody((b) => b + text);
    const { selectionStart: a, selectionEnd: z } = el;
    const next = body.slice(0, a) + text + body.slice(z);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + text.length;
    });
  };
  const sample = exampleData(appliesTo);
  const unknown = unknownFields(`${title}\n${body}`, appliesTo);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="label">Made from</span>
          <select name="appliesTo" className="input" value={appliesTo} onChange={(e) => setAppliesTo(e.target.value as DocSubject)}>
            {Object.entries(DOC_SUBJECTS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Heading printed on it</span>
          <input name="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Certificate of Treatment (blank for a letter)" />
        </label>
      </div>

      <div className="flex gap-1 border-b border-charcoal-200 lg:hidden">
        {(["write", "preview"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${tab === t ? "border-kudu-600 text-kudu-700" : "border-transparent text-charcoal-500"}`}>
            {t === "write" ? "Write" : "Preview"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${tab === "write" ? "" : "hidden"} space-y-3 lg:block`}>
          <textarea ref={area} name="body" aria-label="Document text" className="input min-h-[28rem] font-mono text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
          {unknown.length > 0 && (
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              Not available for a {DOC_SUBJECTS[appliesTo].toLowerCase()}, so left blank: {unknown.map((u) => `{{${u}}}`).join(", ")}
            </p>
          )}
          <details className="rounded-md border border-charcoal-200 p-3 text-xs text-charcoal-600" open>
            <summary className="cursor-pointer font-semibold text-charcoal-700">Fields: click to put one in at the cursor</summary>
            <div className="mt-2 space-y-2">
              {groupsFor(appliesTo).map((g) => (
                <div key={g.label}>
                  <div className="mb-1 font-semibold text-charcoal-700">{g.label}</div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(g.fields).map(([k, [label]]) => (
                      <button key={k} type="button" onClick={() => insert(`{{${k}}}`)} className="rounded border border-charcoal-200 bg-white px-1.5 py-0.5 hover:border-kudu-600 hover:text-kudu-700" title={`{{${k}}}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div>
                <div className="mb-1 font-semibold text-charcoal-700">Blocks (on a line of their own)</div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(BLOCKS).map(([k, v]) => (
                    <button key={k} type="button" onClick={() => insert(`\n${k}\n`)} className="rounded border border-charcoal-200 bg-white px-1.5 py-0.5 hover:border-kudu-600 hover:text-kudu-700" title={v}>
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <p className="pt-1">
                Layout: <code># Heading</code>, <code>## Section</code>, <code>- bullet</code>, <code>**bold**</code>, <code>&gt; highlighted note</code>, <code>---</code> for a line. Leave a blank line between paragraphs.
              </p>
            </div>
          </details>
        </div>
        <div className={`${tab === "preview" ? "" : "hidden"} lg:block`}>
          <div className="sticky top-4 rounded-md border border-charcoal-200 bg-white p-6 shadow-sm">
            <div className="mb-3 text-xs font-semibold tracking-wide text-charcoal-400 uppercase">Preview with example details</div>
            {title && <h1 className="mb-4 text-center text-2xl font-extrabold tracking-wide text-charcoal-900 uppercase">{mergeFields(title, sample)}</h1>}
            <DocBody
              body={mergeFields(body, sample)}
              items={SAMPLE_ITEMS}
              signatures={{ client: { image: null, name: "", date: "" }, company: { image: null, name: sample["job.technician"] ?? "", companyName } }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
