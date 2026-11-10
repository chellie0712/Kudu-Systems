"use client";

import { useState } from "react";
import { CHOICE_TYPES, FIELD_TYPES, MAP_TO, newFieldId, type FieldType, type FormField, type MapTo } from "@/lib/forms";

/**
 * Drag-and-drop form field editor. Fields can be dragged by the handle or moved with the arrows.
 * Submits the fields as JSON in the hidden "fields" input.
 */
export function FormBuilder({ initial, showMapping }: { initial: FormField[]; showMapping: boolean }) {
  const [fields, setFields] = useState<FormField[]>(initial);
  const [open, setOpen] = useState<string | null>(initial[0]?.id ?? null);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const update = (i: number, patch: Partial<FormField>) => setFields((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  const move = (from: number, to: number) =>
    setFields((fs) => {
      if (to < 0 || to >= fs.length || from === to) return fs;
      const next = [...fs];
      const [f] = next.splice(from, 1);
      next.splice(to, 0, f);
      return next;
    });
  const add = (type: FieldType) => {
    const f: FormField = { id: newFieldId(), type, label: "", help: "", required: false, options: CHOICE_TYPES.includes(type) ? ["Option 1", "Option 2"] : [], mapTo: "" };
    setFields((fs) => [...fs, f]);
    setOpen(f.id);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name="fields" value={JSON.stringify(fields)} />
      {fields.length === 0 && <p className="rounded-md border border-dashed border-charcoal-200 p-6 text-center text-sm text-charcoal-500">No fields yet. Add the first one below.</p>}
      <ol className="space-y-2">
        {fields.map((f, i) => {
          const isOpen = open === f.id;
          return (
            <li
              key={f.id}
              onDragOver={(e) => {
                if (drag === null) return;
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) move(drag, i);
                setDrag(null);
                setOver(null);
              }}
              className={`rounded-md border bg-white ${over === i && drag !== null && drag !== i ? "border-kudu-600 ring-2 ring-kudu-200" : "border-charcoal-200"} ${drag === i ? "opacity-50" : ""}`}
            >
              <div className="flex items-center gap-2 p-2">
                <span
                  draggable
                  onDragStart={(e) => {
                    setDrag(i);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", f.id);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  className="cursor-grab px-1 text-lg leading-none text-charcoal-400 select-none active:cursor-grabbing"
                  title="Drag to move"
                  aria-hidden
                >
                  ⠿
                </span>
                <button type="button" onClick={() => setOpen(isOpen ? null : f.id)} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate text-sm ${f.type === "heading" ? "font-bold" : "font-medium"}`}>
                    {f.label || <span className="text-charcoal-400 italic">Untitled</span>}
                    {f.required && <span className="text-kudu-600"> *</span>}
                  </span>
                  <span className="text-xs text-charcoal-500">
                    {FIELD_TYPES[f.type]}
                    {showMapping && f.mapTo ? ` → ${MAP_TO[f.mapTo]}` : ""}
                  </span>
                </button>
                <button type="button" className="px-1.5 text-charcoal-500 hover:text-kudu-600 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label="Move up">↑</button>
                <button type="button" className="px-1.5 text-charcoal-500 hover:text-kudu-600 disabled:opacity-30" disabled={i === fields.length - 1} onClick={() => move(i, i + 1)} aria-label="Move down">↓</button>
                <button
                  type="button"
                  className="px-1.5 text-charcoal-500 hover:text-kudu-600"
                  onClick={() => {
                    const copy = { ...f, id: newFieldId(), label: f.label ? `${f.label} (copy)` : "" };
                    setFields((fs) => [...fs.slice(0, i + 1), copy, ...fs.slice(i + 1)]);
                    setOpen(copy.id);
                  }}
                  aria-label="Duplicate"
                  title="Duplicate"
                >
                  ⧉
                </button>
                <button type="button" className="px-1.5 text-charcoal-400 hover:text-kudu-600" onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))} aria-label="Delete field" title="Delete">✕</button>
              </div>
              {isOpen && (
                <div className="grid gap-3 border-t border-charcoal-100 p-3 sm:grid-cols-2">
                  <label className="block sm:col-span-2">
                    <span className="label">{f.type === "heading" ? "Heading" : "Question"}</span>
                    <input className="input" value={f.label} autoFocus onChange={(e) => update(i, { label: e.target.value })} placeholder={f.type === "heading" ? "e.g. About the property" : "e.g. Which pests have you seen?"} />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="label">{f.type === "heading" ? "Text under the heading" : "Help text"}</span>
                    <input className="input" value={f.help} onChange={(e) => update(i, { help: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="label">Type</span>
                    <select
                      className="input"
                      value={f.type}
                      onChange={(e) => {
                        const type = e.target.value as FieldType;
                        update(i, { type, options: CHOICE_TYPES.includes(type) ? (f.options.length ? f.options : ["Option 1", "Option 2"]) : [], required: type === "heading" ? false : f.required });
                      }}
                    >
                      {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => <option key={t} value={t}>{FIELD_TYPES[t]}</option>)}
                    </select>
                  </label>
                  {f.type !== "heading" && (
                    <label className="flex items-end gap-2 pb-2 text-sm">
                      <input type="checkbox" checked={f.required} onChange={(e) => update(i, { required: e.target.checked })} className="h-4 w-4 accent-kudu-600" /> Required
                    </label>
                  )}
                  {CHOICE_TYPES.includes(f.type) && (
                    <label className="block sm:col-span-2">
                      <span className="label">Options, one per line</span>
                      <textarea
                        className="input"
                        rows={Math.min(8, Math.max(3, f.options.length + 1))}
                        value={f.options.join("\n")}
                        onChange={(e) => update(i, { options: e.target.value.split("\n").map((o) => o.trimStart()) })}
                        onBlur={() => update(i, { options: f.options.map((o) => o.trim()).filter(Boolean) })}
                      />
                    </label>
                  )}
                  {showMapping && f.type !== "heading" && f.type !== "signature" && (
                    <label className="block sm:col-span-2">
                      <span className="label">Web form: put the answer in</span>
                      <select className="input" value={f.mapTo} onChange={(e) => update(i, { mapTo: e.target.value as MapTo })}>
                        {(Object.keys(MAP_TO) as MapTo[]).map((m) => <option key={m} value={m}>{MAP_TO[m]}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <div>
        <div className="label">Add a field</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(FIELD_TYPES) as FieldType[]).map((t) => (
            <button key={t} type="button" onClick={() => add(t)} className="btn-outline py-1 text-xs">+ {FIELD_TYPES[t]}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
