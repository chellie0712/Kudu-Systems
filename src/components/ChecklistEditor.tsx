"use client";

import { useState } from "react";
import { itemsFromTemplate, type ChecklistInput } from "@/lib/checklists";

export type TemplateOption = { id: string; name: string; items: string; requiredForCompletion: boolean; auto: boolean };

/**
 * The job card's checklists. Kept as JSON in the hidden "checklists" field; the server
 * stores them on save. Checklists added automatically (by template rules) cannot be removed.
 */
export function ChecklistEditor({ initial, templates }: { initial: ChecklistInput[]; templates: TemplateOption[] }) {
  const autoIds = new Set(templates.filter((t) => t.auto).map((t) => t.id));
  const [lists, setLists] = useState<ChecklistInput[]>(() => {
    // New job cards start with the automatic checklists already in place.
    const have = new Set(initial.map((l) => l.templateId));
    const auto = templates
      .filter((t) => t.auto && !have.has(t.id))
      .map((t) => ({ templateId: t.id, name: t.name, requiredForCompletion: t.requiredForCompletion, items: itemsFromTemplate(t.items) }));
    return [...initial, ...auto];
  });
  const [pick, setPick] = useState("");
  const available = templates.filter((t) => !lists.some((l) => l.templateId === t.id));

  const update = (li: number, fn: (l: ChecklistInput) => ChecklistInput) => setLists((ls) => ls.map((l, i) => (i === li ? fn(l) : l)));
  const setItem = (li: number, ii: number, patch: Partial<ChecklistInput["items"][number]>) =>
    update(li, (l) => ({ ...l, items: l.items.map((it, j) => (j === ii ? { ...it, ...patch } : it)) }));

  return (
    <div className="space-y-4">
      <input type="hidden" name="checklists" value={JSON.stringify(lists)} />
      {lists.length === 0 && <p className="text-sm text-charcoal-500">No checklists on this job card.</p>}
      {lists.map((l, li) => {
        const done = l.items.filter((i) => i.done).length;
        return (
          <div key={`${l.templateId ?? l.name}-${li}`} className="rounded-md border border-charcoal-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-charcoal-100 bg-charcoal-50 px-3 py-2">
              <div className="text-sm font-semibold">
                {l.name}
                {l.requiredForCompletion && <span className="ml-2 rounded bg-kudu-50 px-1.5 py-0.5 text-[11px] font-medium text-kudu-700">Required to complete</span>}
              </div>
              <div className="flex items-center gap-3 text-xs text-charcoal-500">
                <span>{done}/{l.items.length} done</span>
                <button type="button" className="hover:text-kudu-600" onClick={() => update(li, (x) => ({ ...x, items: x.items.map((i) => ({ ...i, done: true })) }))}>
                  Tick all
                </button>
                {!(l.templateId && autoIds.has(l.templateId)) && (
                  <button type="button" className="hover:text-kudu-600" onClick={() => setLists((ls) => ls.filter((_, i) => i !== li))}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            <ul className="divide-y divide-charcoal-100">
              {l.items.map((it, ii) => (
                <li key={ii} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-3 py-2">
                  <label className="flex min-w-56 flex-1 items-start gap-2 text-sm">
                    <input type="checkbox" checked={it.done} onChange={(e) => setItem(li, ii, { done: e.target.checked })} className="mt-0.5 h-5 w-5 shrink-0 accent-kudu-600" />
                    <span className={it.done ? "text-charcoal-500" : ""}>{it.label}</span>
                  </label>
                  <input
                    className="input w-full py-1 text-xs sm:w-56"
                    placeholder="Note (optional)"
                    value={it.note}
                    onChange={(e) => setItem(li, ii, { note: e.target.value })}
                    aria-label={`Note for ${it.label}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-auto" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Checklist to add">
            <option value="">Add a checklist…</option>
            {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            type="button"
            className="btn-outline"
            disabled={!pick}
            onClick={() => {
              const t = templates.find((x) => x.id === pick);
              if (!t) return;
              setLists((ls) => [...ls, { templateId: t.id, name: t.name, requiredForCompletion: t.requiredForCompletion, items: itemsFromTemplate(t.items) }]);
              setPick("");
            }}
          >
            + Add
          </button>
        </div>
      )}
    </div>
  );
}
