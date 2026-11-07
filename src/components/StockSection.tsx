import type { AppUser } from "@/auth";
import { billMaterialsToDraft, undoStockUse, useStockOnJob } from "@/app/actions/inventory";
import { can } from "@/lib/permissions";
import { fmtQty, roundQty } from "@/lib/inventory";
import { fmtDate, money } from "@/lib/format";
import { ConfirmButton } from "./ConfirmButton";
import { SectionTitle } from "./ui";

type Use = {
  id: string;
  quantity: number;
  note: string;
  userId: string | null;
  userName: string;
  createdAt: Date;
  item: { id: string; name: string; unit: string; sellPrice: number };
  fromLocation: { name: string } | null;
  invoice: { id: string; number: string } | null;
};

/** Products used on a job card: booked out of a van or the warehouse, then billed on the invoice. */
export function StockSection({
  jobCardId,
  used,
  user,
  items,
  locations,
  hasDraftInvoice,
  symbol,
}: {
  jobCardId: string;
  used: Use[];
  user: AppUser;
  items: { id: string; name: string; unit: string; onHand: Record<string, number> }[];
  locations: { id: string; name: string }[];
  hasDraftInvoice: boolean;
  symbol: string;
}) {
  const office = can(user.role, "inventory.manage");
  const bill = can(user.role, "materials.bill");
  const open = used.filter((u) => !u.invoice);
  const value = open.reduce((s, u) => s + Math.round(u.quantity * u.item.sellPrice), 0);
  const only = locations.length === 1 ? locations[0] : null;

  return (
    <div id="stock" className="no-print card mx-auto mt-6 max-w-3xl p-6">
      <SectionTitle>Stock used</SectionTitle>
      {used.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th className="text-right">Qty</th>
                <th>From</th>
                <th>By</th>
                <th>Billing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {used.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.item.name}
                    {u.note && <div className="text-xs text-charcoal-500">{u.note}</div>}
                  </td>
                  <td className="text-right tabular-nums">{fmtQty(u.quantity, u.item.unit)}</td>
                  <td className="text-sm">{u.fromLocation?.name ?? "—"}</td>
                  <td className="text-sm">{u.userName}<div className="text-xs text-charcoal-500">{fmtDate(u.createdAt)}</div></td>
                  <td className="text-xs whitespace-nowrap">
                    {u.invoice ? (bill ? <a href={`/invoices/${u.invoice.id}`} className="text-kudu-600 hover:underline">On {u.invoice.number}</a> : "Billed") : "Not billed"}
                  </td>
                  <td className="text-right">
                    {!u.invoice && (office || u.userId === user.id) && (
                      <form action={undoStockUse}>
                        <input type="hidden" name="id" value={u.id} />
                        <ConfirmButton message={`Remove ${u.item.name} from this job and put it back on ${u.fromLocation?.name ?? "stock"}?`} className="text-xs text-charcoal-400 hover:text-kudu-600">Remove</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-charcoal-500">No stock recorded on this job yet.</p>
      )}

      {locations.length === 0 ? (
        <p className="mt-4 border-t border-charcoal-100 pt-4 text-sm text-charcoal-500">
          {office ? "Add a stock location under Inventory first." : "No van is assigned to you, so you can't book stock out yet. Ask the office to set you as a van's driver."}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 border-t border-charcoal-100 pt-4 text-sm text-charcoal-500">There are no stock items yet{office ? ". Add them under Inventory." : "."}</p>
      ) : (
        <form action={useStockOnJob} className="mt-4 flex flex-wrap items-end gap-2 border-t border-charcoal-100 pt-4">
          <input type="hidden" name="jobCardId" value={jobCardId} />
          <label className="block min-w-48 flex-1">
            <span className="label">Product</span>
            <select name="itemId" required className="input" defaultValue="">
              <option value="" disabled>Choose…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.unit}){only ? ` · ${fmtQty(roundQty(i.onHand[only.id] ?? 0))} on ${only.name}` : ""}
                </option>
              ))}
            </select>
          </label>
          {only ? (
            <input type="hidden" name="locationId" value={only.id} />
          ) : (
            <label className="block w-44">
              <span className="label">Taken from</span>
              <select name="locationId" required className="input" defaultValue="">
                <option value="" disabled>Choose…</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
          )}
          <label className="block w-28">
            <span className="label">Quantity</span>
            <input name="quantity" type="number" step="0.001" min="0.001" required className="input" />
          </label>
          <label className="block min-w-36 flex-1">
            <span className="label">Note</span>
            <input name="note" className="input" placeholder="Optional, e.g. area or dilution" />
          </label>
          <button className="btn-outline">+ Record stock</button>
        </form>
      )}

      {bill && (
        <div className="mt-4 rounded-md bg-charcoal-50 p-3 text-sm">
          {open.length === 0 ? (
            <p className="text-charcoal-500">No unbilled materials.</p>
          ) : (
            <>
              <p className="font-medium">Unbilled materials: {money(value, symbol)} excl. VAT at sell price</p>
              <p className="mt-1 text-xs text-charcoal-500">
                {hasDraftInvoice
                  ? "Add them to this job's draft invoice as one line per product:"
                  : "Create the invoice from this job card first (button at the top), then add the materials to it here."}
              </p>
              {hasDraftInvoice && (
                <form action={billMaterialsToDraft} className="mt-2">
                  <input type="hidden" name="jobCardId" value={jobCardId} />
                  <button className="btn-dark py-1.5">Add materials to draft invoice</button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
