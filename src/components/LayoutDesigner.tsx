"use client";

import { useState, type ReactNode } from "react";
import { DocLayout } from "@/components/DocLayouts";
import {
  ACCENT_PRESETS,
  DEFAULT_STYLE,
  FONTS,
  LAYOUTS,
  LOGO_SIZES,
  type DocData,
  type DocStyle,
  type LayoutId,
} from "@/lib/docLayout";

type Props = {
  quote: DocData;
  invoice: DocData;
  logo: ReactNode;
  initial: { quoteLayout: LayoutId; invoiceLayout: LayoutId; style: DocStyle };
  action: (fd: FormData) => Promise<void>;
};

/** Pick and customise the quotation and invoice layouts, with a live preview. */
export function LayoutDesigner({ quote, invoice, logo, initial, action }: Props) {
  const [quoteLayout, setQuoteLayout] = useState(initial.quoteLayout);
  const [invoiceLayout, setInvoiceLayout] = useState(initial.invoiceLayout);
  const [same, setSame] = useState(initial.quoteLayout === initial.invoiceLayout);
  const [tab, setTab] = useState<"quote" | "invoice">("quote");
  const [style, setStyle] = useState(initial.style);
  const set = <K extends keyof DocStyle>(k: K, v: DocStyle[K]) => setStyle((s) => ({ ...s, [k]: v }));

  const current = tab === "quote" ? quoteLayout : invoiceLayout;
  const doc = tab === "quote" ? quote : invoice;
  const pick = (id: LayoutId) => {
    if (same || tab === "quote") setQuoteLayout(id);
    if (same || tab === "invoice") setInvoiceLayout(id);
  };

  const check = (k: "itemHeadings" | "lineVat" | "showUnits" | "quoteBanking" | "quoteSignature", label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" checked={style[k]} onChange={(e) => set(k, e.target.checked)} className="mt-0.5 h-4 w-4 accent-kudu-600" />
      <span>
        {label}
        {hint && <span className="block text-xs text-charcoal-500">{hint}</span>}
      </span>
    </label>
  );

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="quoteLayout" value={quoteLayout} />
      <input type="hidden" name="invoiceLayout" value={invoiceLayout} />
      <input type="hidden" name="docStyle" value={JSON.stringify(style)} />

      <div className="card space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-md border border-charcoal-200 p-0.5 text-sm">
            {(["quote", "invoice"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded px-3 py-1.5 font-medium ${tab === t ? "bg-charcoal-800 text-white" : "text-charcoal-600 hover:bg-charcoal-50"}`}
              >
                {t === "quote" ? "Quotations" : "Invoices"}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={same}
              onChange={(e) => {
                setSame(e.target.checked);
                if (e.target.checked) {
                  setQuoteLayout(current);
                  setInvoiceLayout(current);
                }
              }}
              className="h-4 w-4 accent-kudu-600"
            />
            Use the same layout for quotations and invoices
          </label>
        </div>
        <p className="text-sm text-charcoal-500">
          Choose a layout for {same ? "quotations and invoices" : tab === "quote" ? "quotations" : "invoices"}. Quotations:{" "}
          <b>{LAYOUTS.find((l) => l.id === quoteLayout)?.name}</b> · Invoices: <b>{LAYOUTS.find((l) => l.id === invoiceLayout)?.name}</b>
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {LAYOUTS.map((l, n) => (
            <button
              key={l.id}
              type="button"
              onClick={() => pick(l.id)}
              aria-pressed={current === l.id}
              className={`group rounded-lg border-2 p-2 text-left transition ${current === l.id ? "border-kudu-600 ring-2 ring-kudu-100" : "border-charcoal-100 hover:border-charcoal-300"}`}
            >
              <div className="relative h-56 overflow-hidden rounded border border-charcoal-100 bg-white">
                <div className="pointer-events-none absolute top-0 left-0 w-[800px] origin-top-left scale-[0.22] p-8" aria-hidden>
                  <DocLayout layout={l.id} doc={doc} style={style} logo={logo} />
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm font-semibold">
                <span>{n + 1}. {l.name}</span>
                {current === l.id && <span className="text-xs text-kudu-600">Selected</span>}
              </div>
              <div className="text-xs leading-snug text-charcoal-500">{l.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[20rem_1fr]">
        <div className="card h-fit space-y-5 p-5">
          <div>
            <span className="label">Accent colour</span>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  title={p.label}
                  aria-label={p.label}
                  onClick={() => set("accent", p.value)}
                  className={`h-7 w-7 rounded-full border-2 ${style.accent === p.value ? "border-charcoal-900 ring-2 ring-charcoal-200" : "border-white shadow"}`}
                  style={{ background: p.value }}
                />
              ))}
              <input type="color" value={style.accent} onChange={(e) => set("accent", e.target.value)} className="h-8 w-10 cursor-pointer rounded border border-charcoal-200" aria-label="Custom colour" />
            </div>
          </div>
          <label className="block">
            <span className="label">Font</span>
            <select value={style.font} onChange={(e) => set("font", e.target.value as DocStyle["font"])} className="input">
              {Object.entries(FONTS).map(([k, f]) => <option key={k} value={k}>{f.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Logo size</span>
              <select value={style.logoSize} onChange={(e) => set("logoSize", e.target.value as DocStyle["logoSize"])} className="input">
                {Object.entries(LOGO_SIZES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Logo position</span>
              <select value={style.logoSide} onChange={(e) => set("logoSide", e.target.value as DocStyle["logoSide"])} className="input">
                <option value="auto">Layout default</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <span className="label">Line items</span>
            {check("itemHeadings", "First line of each description in bold", "The lines under it print in italics, like a heading with details.")}
            {check("lineVat", "Show VAT %, excl. and incl. totals per line")}
            {check("showUnits", "Show units next to the quantity")}
          </div>
          <div className="space-y-2">
            <span className="label">Quotations</span>
            {check("quoteBanking", "Print banking details on quotations", "Invoices always show them when filled in.")}
            {check("quoteSignature", "Print “Accepted by” signature lines")}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="label">Quotation title</span>
              <input value={style.quoteTitle} onChange={(e) => set("quoteTitle", e.target.value)} className="input" placeholder="Quotation" />
            </label>
            <label className="block">
              <span className="label">Invoice title</span>
              <input value={style.invoiceTitle} onChange={(e) => set("invoiceTitle", e.target.value)} className="input" placeholder="Automatic" />
            </label>
          </div>
          <p className="-mt-3 text-xs text-charcoal-500">An empty invoice title prints “Tax Invoice” when your VAT number is set, otherwise “Invoice”.</p>
          <label className="block">
            <span className="label">Contact person (printed in your details)</span>
            <input value={style.contactPerson} onChange={(e) => set("contactPerson", e.target.value)} className="input" />
          </label>
          <label className="block">
            <span className="label">Footer (bottom of every quote and invoice)</span>
            <textarea value={style.footer} onChange={(e) => set("footer", e.target.value)} rows={3} className="input" placeholder="e.g. Thank you for your business." />
          </label>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-primary">Save layout</button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setStyle(DEFAULT_STYLE);
                setQuoteLayout("classic");
                setInvoiceLayout("classic");
                setSame(true);
              }}
            >
              Reset to defaults
            </button>
          </div>
          <p className="text-xs text-charcoal-500">Changes show in the preview straight away and apply to all documents once saved, including ones already issued.</p>
        </div>

        <div>
          <div className="mb-2 text-sm font-semibold text-charcoal-600">
            Preview: {tab === "quote" ? "quotation" : "invoice"} in the {LAYOUTS.find((l) => l.id === current)?.name} layout (sample customer)
          </div>
          <div className="overflow-x-auto">
            <div className="card min-w-[720px] p-8">
              <DocLayout layout={current} doc={doc} style={style} logo={logo} />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
