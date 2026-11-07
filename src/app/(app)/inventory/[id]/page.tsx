import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";
import { can } from "@/lib/permissions";
import { fmtQty, roundQty } from "@/lib/inventory";
import { deleteStockItem } from "@/app/actions/inventory";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { StockItemForm, StockMovementForms } from "@/components/StockForms";
import { MovementTable } from "@/components/MovementTable";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function StockItemPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("inventory.view");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [item, locations, settings] = await Promise.all([
    db.stockItem.findUnique({
      where: { id },
      include: {
        levels: { include: { location: { select: { id: true, name: true, type: true, active: true } } } },
        movements: {
          include: { item: { select: { id: true, name: true, unit: true } }, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } }, jobCard: { select: { id: true, number: true } } },
          orderBy: { createdAt: "desc" },
          take: 200,
        },
      },
    }),
    db.stockLocation.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    getSettings(),
  ]);
  if (!item) notFound();
  const manage = can(user.role, "inventory.manage");
  const total = roundQty(item.levels.reduce((s, l) => s + l.quantity, 0));
  const sym = settings.currencySymbol;
  const levels = item.levels.filter((l) => l.quantity !== 0 || l.location.active).sort((a, b) => a.location.name.localeCompare(b.location.name));

  return (
    <div>
      <PageHeader
        back={{ href: "/inventory", label: "Inventory" }}
        title={item.name}
        subtitle={[item.sku, `Unit: ${item.unit}`, `Cost ${money(item.costPrice, sym)}`, `Sell ${money(item.sellPrice, sym)}`, !item.active && "Inactive"].filter(Boolean).join(" · ")}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="card mb-6 p-6">
        <SectionTitle>On hand</SectionTitle>
        <div className="flex flex-wrap gap-3">
          <div className={`rounded-md border-l-4 border-kudu-600 bg-charcoal-50 px-4 py-2 ${item.reorderLevel > 0 && total <= item.reorderLevel ? "text-kudu-700" : ""}`}>
            <div className="text-xs font-semibold text-charcoal-500 uppercase">Total</div>
            <div className="text-xl font-bold">{fmtQty(total, item.unit)}</div>
            {item.reorderLevel > 0 && <div className="text-xs">reorder at ≤ {fmtQty(item.reorderLevel)}</div>}
          </div>
          {levels.map((l) => (
            <div key={l.locationId} className="rounded-md bg-charcoal-50 px-4 py-2">
              <div className="text-xs font-semibold text-charcoal-500">{l.location.name}{l.location.type === "VAN" ? " (van)" : ""}</div>
              <div className={`text-lg font-semibold tabular-nums ${l.quantity < 0 ? "text-kudu-600" : ""}`}>{fmtQty(l.quantity)}</div>
            </div>
          ))}
        </div>
        {total < 0 && <p className="mt-2 text-sm text-kudu-700">The total is below zero: more was used than was booked in. Receive the missing stock or do a stock count.</p>}
      </div>

      {manage && locations.length > 0 && (
        <div className="card mb-6 p-6">
          <SectionTitle>Move stock</SectionTitle>
          <StockMovementForms items={[item]} itemId={item.id} locations={locations} returnTo={`/inventory/${item.id}`} />
        </div>
      )}

      {manage && (
        <div className="card mb-6 p-6">
          <SectionTitle>Item details</SectionTitle>
          <StockItemForm item={item} />
        </div>
      )}

      <div className="card mb-6 overflow-x-auto">
        <div className="p-6 pb-0"><SectionTitle>History</SectionTitle></div>
        {item.movements.length === 0 ? <Empty>No movements yet.</Empty> : <MovementTable rows={item.movements} />}
      </div>

      {can(user.role, "inventory.delete") && (
        <form action={deleteStockItem} className="text-right">
          <input type="hidden" name="id" value={item.id} />
          <ConfirmButton message={`Delete ${item.name} and its whole stock history?`}>Delete item</ConfirmButton>
        </form>
      )}
    </div>
  );
}
