import type { TenantDb } from "./db";

/** What the purchase order form needs: stock items, delivery locations and earlier suppliers. */
export async function poFormData(db: TenantDb) {
  const [items, locations, suppliers] = await Promise.all([
    db.stockItem.findMany({ where: { active: true }, select: { id: true, name: true, unit: true, costPrice: true }, orderBy: { name: "asc" } }),
    db.stockLocation.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    db.purchaseOrder.findMany({ distinct: ["supplier"], select: { supplier: true }, orderBy: { supplier: "asc" }, take: 200 }),
  ]);
  return { items, locations, suppliers: suppliers.map((s) => s.supplier) };
}
