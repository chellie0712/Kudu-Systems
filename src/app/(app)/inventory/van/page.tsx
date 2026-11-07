import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtQty, roundQty } from "@/lib/inventory";
import { Empty, PageHeader, SectionTitle } from "@/components/ui";
import { MovementTable } from "@/components/MovementTable";

export const metadata = { title: "My van" };

/** A technician's own van stock: what is on board and what moved in or out. */
export default async function MyVanPage() {
  const user = await requirePermission("stock.use");
  const db = await tenantDb();
  const vans = await db.stockLocation.findMany({
    where: { type: "VAN", userId: user.id, active: true },
    include: { levels: { include: { item: { select: { name: true, unit: true, active: true } } } } },
    orderBy: { name: "asc" },
  });
  const ids = vans.map((v) => v.id);
  const recent = ids.length
    ? await db.stockMovement.findMany({
        where: { OR: [{ fromLocationId: { in: ids } }, { toLocationId: { in: ids } }] },
        include: { item: { select: { id: true, name: true, unit: true } }, fromLocation: { select: { name: true } }, toLocation: { select: { name: true } }, jobCard: { select: { id: true, number: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      })
    : [];

  return (
    <div>
      <PageHeader title="My van" subtitle="Stock on your van. Record what you use on each job card under “Stock used”." />
      {vans.length === 0 && (
        <div className="card"><Empty>No van is assigned to you yet. Ask the office to set you as the driver under Inventory → Locations.</Empty></div>
      )}
      {vans.map((v) => {
        const levels = v.levels.filter((l) => l.quantity !== 0).sort((a, b) => a.item.name.localeCompare(b.item.name));
        return (
          <div key={v.id} className="card mb-6 overflow-x-auto p-6">
            <SectionTitle>{v.name}</SectionTitle>
            {levels.length === 0 ? (
              <p className="text-sm text-charcoal-500">Nothing on this van.</p>
            ) : (
              <table className="table">
                <thead><tr><th>Product</th><th className="text-right">On board</th></tr></thead>
                <tbody>
                  {levels.map((l) => (
                    <tr key={l.itemId}>
                      <td>{l.item.name}</td>
                      <td className={`text-right font-semibold tabular-nums ${l.quantity < 0 ? "text-kudu-600" : ""}`}>{fmtQty(roundQty(l.quantity), l.item.unit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
      {recent.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="p-6 pb-0"><SectionTitle>Recent movements</SectionTitle></div>
          <MovementTable rows={recent} showItem itemLinks={false} />
        </div>
      )}
    </div>
  );
}
