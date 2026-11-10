import type { PoStatus, PurchaseOrder, PurchaseOrderLine } from "@prisma/client";
import { savePurchaseOrder } from "@/app/actions/purchases";
import { toDateInput } from "@/lib/format";
import { PO_STATUS_COLOURS, PO_STATUS_LABELS } from "@/lib/purchases";
import { Field } from "./ui";
import { PoLinesEditor } from "./PoLinesEditor";

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${PO_STATUS_COLOURS[status]}`}>{PO_STATUS_LABELS[status]}</span>;
}

/** New or edit purchase order form. */
export function PoForm({
  po,
  prefill = [],
  items,
  locations,
  suppliers,
  vatRate,
  symbol,
}: {
  po?: PurchaseOrder & { lines: PurchaseOrderLine[] };
  prefill?: { itemId: string | null; description: string; quantity: number; unitCost: number }[];
  items: { id: string; name: string; unit: string; costPrice: number }[];
  locations: { id: string; name: string }[];
  suppliers: string[];
  vatRate: number;
  symbol: string;
}) {
  return (
    <form action={savePurchaseOrder} className="card space-y-5 p-6">
      {po && <input type="hidden" name="id" value={po.id} />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Supplier *">
          <input name="supplier" required list="po-suppliers" className="input" defaultValue={po?.supplier} />
          <datalist id="po-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist>
        </Field>
        <Field label="Supplier email"><input name="supplierEmail" type="email" className="input" defaultValue={po?.supplierEmail} /></Field>
        <Field label="Supplier's quote or reference"><input name="supplierRef" className="input" defaultValue={po?.supplierRef} /></Field>
        <Field label="Deliver to">
          <select name="locationId" className="input" defaultValue={po?.locationId ?? locations[0]?.id ?? ""}>
            <option value="">Not into stock</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </Field>
        <Field label="Expected delivery"><input name="expectedAt" type="date" className="input" defaultValue={toDateInput(po?.expectedAt ?? null)} /></Field>
      </div>
      <PoLinesEditor items={items} initial={po ? [...po.lines].sort((a, b) => a.sortOrder - b.sortOrder) : prefill} vatRate={po?.vatRate ?? vatRate} symbol={symbol} />
      <Field label="Notes for the supplier"><textarea name="notes" rows={3} className="input" defaultValue={po?.notes} placeholder="e.g. Deliver to the back gate before 10:00" /></Field>
      <button className="btn-primary">{po ? "Save purchase order" : "Create purchase order"}</button>
    </form>
  );
}
