import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { fmtQty, stockOverview } from "@/lib/inventory";
import { saveStockLocation } from "@/app/actions/inventory";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { StockItemForm, StockMovementForms } from "@/components/StockForms";
import { MovementTable } from "@/components/MovementTable";

export const metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; show?: string }> }) {
  const user = await requirePermission("inventory.view");
  const db = await tenantDb();
  const { msg, err, show } = await searchParams;
  const manage = can(user, "inventory.manage");
  const [items, allLocations, settings, people, recent] = await Promise.all([
    stockOverview(db),
    db.stockLocation.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    getSettings(),
    db.user.findMany({ where: { disabled: false }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    db.stockMovement.findMany({
      include: { item: { select: { id: true, name: true, unit: true } }, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } }, jobCard: { select: { id: true, number: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);
  const locations = allLocations.filter((l) => l.active);
  const sym = settings.currencySymbol;
  const shown = show === "low" ? items.filter((i) => i.low) : items;
  const low = items.filter((i) => i.low);
  const value = items.reduce((s, i) => s + Math.max(0, i.total) * i.costPrice, 0);
  const inactive = await db.stockItem.count({ where: { active: false } });

  return (
    <div>
      <PageHeader
        title="Inventory"
        subtitle={`${items.length} item${items.length === 1 ? "" : "s"} · stock value at cost ${money(Math.round(value), sym)} excl. VAT`}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {low.length > 0 && (
        <Link href={show === "low" ? "/inventory" : "/inventory?show=low"} className="mb-4 block rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 hover:bg-amber-100">
          {low.length} item{low.length === 1 ? " is" : "s are"} at or below the reorder level: {low.map((i) => i.name).join(", ")}
          {show === "low" ? " · show all" : " · show only these"} →
        </Link>
      )}

      <div className="card mb-6 overflow-x-auto">
        {shown.length === 0 ? (
          <Empty>No stock items yet. Add your products below, then receive stock into the warehouse.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th className="text-right">Total</th>
                {locations.map((l) => <th key={l.id} className="text-right">{l.name}</th>)}
                <th className="text-right">Cost</th>
                <th className="text-right">Sell</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.id}>
                  <td>
                    <Link href={`/inventory/${i.id}`} className="font-medium text-kudu-700 hover:underline">{i.name}</Link>
                    <div className="text-xs text-charcoal-500">{[i.sku, i.unit].filter(Boolean).join(" · ")}</div>
                  </td>
                  <td className={`text-right font-semibold tabular-nums ${i.low || i.total < 0 ? "text-kudu-600" : ""}`}>
                    {fmtQty(i.total)}
                    {i.low && <div className="text-[11px] font-medium">reorder ≤ {fmtQty(i.reorderLevel)}</div>}
                  </td>
                  {locations.map((l) => {
                    const q = i.levels.find((x) => x.locationId === l.id)?.quantity ?? 0;
                    return <td key={l.id} className={`text-right tabular-nums ${q < 0 ? "text-kudu-600" : q === 0 ? "text-charcoal-300" : ""}`}>{fmtQty(q)}</td>;
                  })}
                  <td className="text-right tabular-nums">{money(i.costPrice, sym)}</td>
                  <td className="text-right tabular-nums">{money(i.sellPrice, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {inactive > 0 && <p className="px-4 py-2 text-xs text-charcoal-500">{inactive} inactive item{inactive === 1 ? "" : "s"} hidden.</p>}
      </div>

      {manage && items.length > 0 && locations.length > 0 && (
        <div className="card mb-6 p-6">
          <SectionTitle>Move stock</SectionTitle>
          <StockMovementForms items={items} locations={locations} returnTo="/inventory" />
        </div>
      )}

      {manage && (
        <div className="card mb-6 p-6">
          <SectionTitle>Add an item</SectionTitle>
          <StockItemForm />
        </div>
      )}

      <div id="locations" className="card mb-6 p-6">
        <SectionTitle>Locations: warehouse and vans</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-600">
          Give each van its driver. Technicians see their own van under “My van” and can only book stock out of it.
        </p>
        <div className="space-y-2">
          {allLocations.map((l) =>
            manage ? (
              <form key={l.id} action={saveStockLocation} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={l.id} />
                <input name="name" defaultValue={l.name} required className="input w-48 py-1.5" aria-label="Location name" />
                <select name="type" defaultValue={l.type} className="input w-32 py-1.5" aria-label="Type">
                  <option value="WAREHOUSE">Warehouse</option>
                  <option value="VAN">Van</option>
                </select>
                <select name="userId" defaultValue={l.userId ?? ""} className="input w-48 py-1.5" aria-label="Driver">
                  <option value="">No driver</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
                </select>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={l.active} className="accent-kudu-600" /> Active</label>
                <button className="btn-outline py-1.5">Save</button>
              </form>
            ) : (
              <div key={l.id} className="text-sm">
                <b>{l.name}</b> · {l.type === "VAN" ? `Van${l.user ? `, ${l.user.name || l.user.email}` : ""}` : "Warehouse"}
                {!l.active && " (inactive)"}
              </div>
            ),
          )}
        </div>
        {manage && (
          <form action={saveStockLocation} className="mt-4 flex flex-wrap items-center gap-2 border-t border-charcoal-100 pt-4">
            <input name="name" required className="input w-48 py-1.5" placeholder="e.g. Van 2 (CA 123-456)" aria-label="New location name" />
            <select name="type" defaultValue="VAN" className="input w-32 py-1.5" aria-label="New location type">
              <option value="WAREHOUSE">Warehouse</option>
              <option value="VAN">Van</option>
            </select>
            <select name="userId" defaultValue="" className="input w-48 py-1.5" aria-label="New location driver">
              <option value="">No driver</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
            </select>
            <button className="btn-primary py-1.5">+ Add location</button>
          </form>
        )}
      </div>

      <div className="card overflow-x-auto">
        <div className="p-6 pb-0"><SectionTitle>Recent stock movements</SectionTitle></div>
        {recent.length === 0 ? (
          <Empty>Nothing moved yet.</Empty>
        ) : (
          <MovementTable rows={recent} showItem />
        )}
      </div>
    </div>
  );
}
