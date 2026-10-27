"use client";

import { useState } from "react";

type Row = { description: string; quantity: string; unit: string; unitPrice: string };

const blank: Row = { description: "", quantity: "1", unit: "", unitPrice: "" };

function cents(v: string) {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

function fmt(c: number, symbol: string) {
  return `${symbol} ${(c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Editable line items with live totals. Submits JSON in the hidden "items" field. */
export function LineItemsEditor({
  initial,
  vatRate: initialVat,
  discount: initialDiscount,
  symbol = "R",
}: {
  initial: { description: string; quantity: number; unit: string; unitPrice: number }[];
  vatRate: number;
  discount: number;
  symbol?: string;
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.length
      ? initial.map((i) => ({
          description: i.description,
          quantity: String(i.quantity),
          unit: i.unit,
          unitPrice: (i.unitPrice / 100).toFixed(2),
        }))
      : [{ ...blank }],
  );
  const [vatRate, setVatRate] = useState(String(initialVat));
  const [discount, setDiscount] = useState((initialDiscount / 100).toFixed(2));

  const update = (idx: number, key: keyof Row, value: string) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, [key]: value } : row)));
  const move = (idx: number, dir: -1 | 1) =>
    setRows((r) => {
      const j = idx + dir;
      if (j < 0 || j >= r.length) return r;
      const copy = [...r];
      [copy[idx], copy[j]] = [copy[j], copy[idx]];
      return copy;
    });

  const lineTotals = rows.map((r) => Math.round((Number(r.quantity.replace(",", ".")) || 0) * cents(r.unitPrice)));
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  const net = Math.max(0, subtotal - cents(discount));
  const vat = Math.round((net * (Number(vatRate) || 0)) / 100);

  const payload = rows
    .filter((r) => r.description.trim())
    .map((r) => ({
      description: r.description.trim(),
      quantity: Number(r.quantity.replace(",", ".")) || 0,
      unit: r.unit.trim(),
      unitPrice: cents(r.unitPrice),
    }));

  return (
    <div>
      <input type="hidden" name="items" value={JSON.stringify(payload)} />
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr>
              <th className="w-[46%]">Description</th>
              <th className="w-20">Qty</th>
              <th className="w-24">Unit</th>
              <th className="w-32">Unit price (excl.)</th>
              <th className="w-32 text-right">Line total</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <td>
                  <textarea
                    className="input min-h-[38px]"
                    rows={1}
                    value={row.description}
                    placeholder="Service or product"
                    onChange={(e) => update(i, "description", e.target.value)}
                  />
                </td>
                <td>
                  <input className="input" inputMode="decimal" value={row.quantity} onChange={(e) => update(i, "quantity", e.target.value)} />
                </td>
                <td>
                  <input className="input" value={row.unit} placeholder="ea, m², hr" onChange={(e) => update(i, "unit", e.target.value)} />
                </td>
                <td>
                  <input className="input" inputMode="decimal" value={row.unitPrice} placeholder="0.00" onChange={(e) => update(i, "unitPrice", e.target.value)} />
                </td>
                <td className="pt-4 text-right font-medium tabular-nums">{fmt(lineTotals[i], symbol)}</td>
                <td className="whitespace-nowrap pt-3 text-right">
                  <button type="button" className="px-1 text-charcoal-400 hover:text-charcoal-800" onClick={() => move(i, -1)} title="Move up">↑</button>
                  <button type="button" className="px-1 text-charcoal-400 hover:text-charcoal-800" onClick={() => move(i, 1)} title="Move down">↓</button>
                  <button
                    type="button"
                    className="px-1 text-kudu-600 hover:text-kudu-800"
                    onClick={() => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [{ ...blank }]))}
                    title="Remove line"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-outline mt-3" onClick={() => setRows((r) => [...r, { ...blank }])}>
        + Add line
      </button>

      <div className="mt-4 ml-auto max-w-xs space-y-2 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmt(subtotal, symbol)}</span></div>
        <div className="flex items-center justify-between gap-2">
          <span>Discount</span>
          <input name="discount" className="input w-28 text-right" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span>VAT %</span>
          <input name="vatRate" className="input w-28 text-right" inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
        </div>
        <div className="flex justify-between"><span>VAT</span><span className="tabular-nums">{fmt(vat, symbol)}</span></div>
        <div className="flex justify-between border-t border-charcoal-200 pt-2 text-base font-bold">
          <span>Total</span><span className="tabular-nums text-kudu-700">{fmt(net + vat, symbol)}</span>
        </div>
      </div>
    </div>
  );
}
