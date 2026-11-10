"use client";

import { useState } from "react";

type Item = { id: string; name: string; unit: string; costPrice: number };
type Row = { itemId: string; description: string; quantity: string; unitCost: string };

const toCents = (v: string) => {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fmt = (c: number, symbol: string) => `${symbol} ${(c / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Purchase order lines: pick a stock item (or type anything), quantity and price excl. VAT. Submits JSON in "lines". */
export function PoLinesEditor({
  items,
  initial,
  vatRate: initialVat,
  symbol = "R",
}: {
  items: Item[];
  initial: { itemId: string | null; description: string; quantity: number; unitCost: number }[];
  vatRate: number;
  symbol?: string;
}) {
  const blank: Row = { itemId: "", description: "", quantity: "1", unitCost: "" };
  const [rows, setRows] = useState<Row[]>(
    initial.length ? initial.map((l) => ({ itemId: l.itemId ?? "", description: l.description, quantity: String(l.quantity), unitCost: (l.unitCost / 100).toFixed(2) })) : [{ ...blank }],
  );
  const [vatRate, setVatRate] = useState(String(initialVat));
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const parsed = rows
    .map((r) => ({ itemId: r.itemId, description: r.description.trim(), quantity: Number(r.quantity.replace(",", ".")), unitCost: toCents(r.unitCost) }))
    .filter((r) => r.description && r.quantity > 0);
  const subtotal = parsed.reduce((s, r) => s + Math.round(r.quantity * r.unitCost), 0);
  const vat = Math.round((subtotal * (Number(vatRate) || 0)) / 100);

  return (
    <div className="space-y-3">
      <input type="hidden" name="lines" value={JSON.stringify(parsed)} />
      <div className="overflow-x-auto">
        <table className="table min-w-[640px]">
          <thead>
            <tr><th className="w-56">Stock item</th><th>Description</th><th className="w-24">Qty</th><th className="w-32">Unit price excl. VAT</th><th className="w-28 text-right">Total</th><th className="w-8" /></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const item = items.find((it) => it.id === r.itemId);
              return (
                <tr key={i}>
                  <td>
                    <select
                      className="input py-1.5"
                      aria-label="Stock item"
                      value={r.itemId}
                      onChange={(e) => {
                        const it = items.find((x) => x.id === e.target.value);
                        set(i, it ? { itemId: it.id, description: it.name, unitCost: (it.costPrice / 100).toFixed(2) } : { itemId: "" });
                      }}
                    >
                      <option value="">Not a stock item</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </select>
                  </td>
                  <td><input className="input py-1.5" aria-label="Description" value={r.description} onChange={(e) => set(i, { description: e.target.value })} /></td>
                  <td>
                    <input className="input py-1.5" aria-label="Quantity" inputMode="decimal" value={r.quantity} onChange={(e) => set(i, { quantity: e.target.value })} />
                    {item && <span className="text-xs text-charcoal-500">{item.unit}</span>}
                  </td>
                  <td><input className="input py-1.5" aria-label="Unit price" inputMode="decimal" value={r.unitCost} placeholder="0.00" onChange={(e) => set(i, { unitCost: e.target.value })} /></td>
                  <td className="text-right tabular-nums">{fmt(Math.round((Number(r.quantity.replace(",", ".")) || 0) * toCents(r.unitCost)), symbol)}</td>
                  <td>
                    {rows.length > 1 && (
                      <button type="button" className="text-charcoal-400 hover:text-kudu-600" aria-label="Remove line" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-outline py-1 text-sm" onClick={() => setRows((r) => [...r, { ...blank }])}>+ Add line</button>
      <div className="ml-auto max-w-xs space-y-1 text-sm">
        <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{fmt(subtotal, symbol)}</span></div>
        <div className="flex items-center justify-between gap-2">
          <span>VAT <input name="vatRate" className="input inline w-16 py-0.5" inputMode="decimal" value={vatRate} onChange={(e) => setVatRate(e.target.value)} aria-label="VAT rate" /> %</span>
          <span className="tabular-nums">{fmt(vat, symbol)}</span>
        </div>
        <div className="flex justify-between font-bold"><span>Total</span><span className="tabular-nums">{fmt(subtotal + vat, symbol)}</span></div>
      </div>
    </div>
  );
}
