import type { StockItem, StockLocation } from "@prisma/client";
import { adjustStock, receiveStock, saveStockItem, transferStock } from "@/app/actions/inventory";
import { centsToInput } from "@/lib/format";

type Item = Pick<StockItem, "id" | "name" | "unit">;
type Loc = Pick<StockLocation, "id" | "name" | "type">;

function ItemSelect({ items, itemId }: { items: Item[]; itemId?: string }) {
  if (itemId) return <input type="hidden" name="itemId" value={itemId} />;
  return (
    <label className="block min-w-48 flex-1">
      <span className="label">Item</span>
      <select name="itemId" required className="input" defaultValue="">
        <option value="" disabled>Choose…</option>
        {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
      </select>
    </label>
  );
}

function LocSelect({ name, label, locations, defaultValue }: { name: string; label: string; locations: Loc[]; defaultValue?: string }) {
  return (
    <label className="block w-48">
      <span className="label">{label}</span>
      <select name={name} required className="input" defaultValue={defaultValue ?? ""}>
        <option value="" disabled>Choose…</option>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}{l.type === "VAN" ? " (van)" : ""}</option>)}
      </select>
    </label>
  );
}

const Qty = ({ name = "quantity", label = "Quantity" }: { name?: string; label?: string }) => (
  <label className="block w-28">
    <span className="label">{label}</span>
    <input name={name} type="number" step="0.001" min={name === "counted" ? "0" : "0.001"} required className="input" />
  </label>
);

const Note = ({ placeholder }: { placeholder: string }) => (
  <label className="block min-w-40 flex-1">
    <span className="label">Note</span>
    <input name="note" className="input" placeholder={placeholder} />
  </label>
);

/** Receive, transfer and count forms. With `itemId` they work on one item (the item page). */
export function StockMovementForms({ items, locations, itemId, returnTo }: { items: Item[]; locations: Loc[]; itemId?: string; returnTo: string }) {
  const warehouse = locations.find((l) => l.type === "WAREHOUSE")?.id;
  return (
    <div className="space-y-5">
      <form action={receiveStock} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <span className="w-24 pb-2 text-sm font-bold text-charcoal-700">Receive</span>
        <ItemSelect items={items} itemId={itemId} />
        <LocSelect name="locationId" label="Into" locations={locations} defaultValue={warehouse} />
        <Qty />
        <label className="block w-32">
          <span className="label">New cost / unit</span>
          <input name="costPrice" inputMode="decimal" className="input" placeholder="unchanged" />
        </label>
        <Note placeholder="Supplier, invoice no." />
        <button className="btn-primary">Receive</button>
      </form>
      <form action={transferStock} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <span className="w-24 pb-2 text-sm font-bold text-charcoal-700">Transfer</span>
        <ItemSelect items={items} itemId={itemId} />
        <LocSelect name="fromLocationId" label="From" locations={locations} defaultValue={warehouse} />
        <LocSelect name="toLocationId" label="To" locations={locations} />
        <Qty />
        <Note placeholder="Optional" />
        <button className="btn-dark">Transfer</button>
      </form>
      <form action={adjustStock} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <span className="w-24 pb-2 text-sm font-bold text-charcoal-700">Stock count</span>
        <ItemSelect items={items} itemId={itemId} />
        <LocSelect name="locationId" label="At" locations={locations} />
        <Qty name="counted" label="Counted" />
        <Note placeholder="Stock count" />
        <button className="btn-outline">Save count</button>
      </form>
      <p className="text-xs text-charcoal-500">
        A stock count sets the quantity at that location to what you counted and records the difference in the history.
      </p>
    </div>
  );
}

/** Add or edit a stock item. */
export function StockItemForm({ item }: { item?: StockItem }) {
  return (
    <form action={saveStockItem} className="grid gap-3 sm:grid-cols-6">
      {item && <input type="hidden" name="id" value={item.id} />}
      <label className="block sm:col-span-3">
        <span className="label">Name</span>
        <input name="name" required defaultValue={item?.name} className="input" placeholder="e.g. Cypermethrin 200 EC" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Code / SKU</span>
        <input name="sku" defaultValue={item?.sku} className="input" />
      </label>
      <label className="block">
        <span className="label">Unit</span>
        <input name="unit" defaultValue={item?.unit ?? "each"} list="stock-units" className="input" />
        <datalist id="stock-units">
          {["each", "ml", "L", "g", "kg", "box", "bait station", "m"].map((u) => <option key={u} value={u} />)}
        </datalist>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Cost price / unit (excl. VAT)</span>
        <input name="costPrice" inputMode="decimal" defaultValue={item ? centsToInput(item.costPrice) : ""} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Sell price / unit (excl. VAT)</span>
        <input name="sellPrice" inputMode="decimal" defaultValue={item ? centsToInput(item.sellPrice) : ""} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Warn when total is at or below</span>
        <input name="reorderLevel" type="number" step="0.001" min="0" defaultValue={item?.reorderLevel || ""} className="input" placeholder="0 = no warning" />
      </label>
      <label className="block sm:col-span-6">
        <span className="label">Notes</span>
        <input name="notes" defaultValue={item?.notes} className="input" placeholder="Registration no., dilution, supplier…" />
      </label>
      <div className="flex items-center gap-4 sm:col-span-6">
        {item && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={item.active} className="accent-kudu-600" /> Active (untick to hide it from lists)
          </label>
        )}
        <button className="btn-primary ml-auto">{item ? "Save item" : "+ Add item"}</button>
      </div>
    </form>
  );
}
