import type { Prisma, StockMovementKind } from "@prisma/client";
import type { TenantDb } from "@/lib/db";

/** Quantities are kept to 3 decimals (e.g. 0.125 L). */
export const roundQty = (n: number) => Math.round(n * 1000) / 1000;

export function fmtQty(n: number, unit?: string): string {
  const v = roundQty(n);
  const s = Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return unit ? `${s} ${unit}` : s;
}

export const MOVEMENT_LABELS: Record<StockMovementKind, string> = {
  RECEIVE: "Received",
  TRANSFER: "Transferred",
  USE: "Used on job",
  ADJUST: "Count adjusted",
};

/**
 * Applies a stock movement inside a transaction: records it and updates the levels at the
 * locations it touches. Levels may go below zero; that is shown as a warning, not blocked,
 * because product is sometimes used before it is booked in.
 */
export async function applyMovement(
  tx: Prisma.TransactionClient,
  m: {
    itemId: string;
    kind: StockMovementKind;
    quantity: number;
    fromLocationId?: string | null;
    toLocationId?: string | null;
    jobCardId?: string | null;
    note?: string;
    userId?: string | null;
    userName: string;
  },
) {
  const qty = roundQty(m.quantity);
  const change = async (locationId: string, delta: number) =>
    tx.stockLevel.upsert({
      where: { itemId_locationId: { itemId: m.itemId, locationId } },
      update: { quantity: { increment: delta } },
      create: { itemId: m.itemId, locationId, quantity: delta },
    });
  if (m.kind === "ADJUST") {
    if (m.toLocationId) await change(m.toLocationId, qty); // signed change
  } else {
    if (m.fromLocationId) await change(m.fromLocationId, -qty);
    if (m.toLocationId) await change(m.toLocationId, qty);
  }
  return tx.stockMovement.create({
    data: {
      itemId: m.itemId,
      kind: m.kind,
      quantity: qty,
      fromLocationId: m.fromLocationId ?? null,
      toLocationId: m.toLocationId ?? null,
      jobCardId: m.jobCardId ?? null,
      note: m.note ?? "",
      userId: m.userId ?? null,
      userName: m.userName,
    },
  });
}

/** Active items with their total on hand, and whether they are at or below the reorder level. */
export async function stockOverview(db: TenantDb) {
  const items = await db.stockItem.findMany({
    where: { active: true },
    include: { levels: { select: { locationId: true, quantity: true } } },
    orderBy: { name: "asc" },
  });
  return items.map((i) => {
    const total = roundQty(i.levels.reduce((s, l) => s + l.quantity, 0));
    return { ...i, total, low: i.reorderLevel > 0 && total <= i.reorderLevel };
  });
}

/** Text for a movement's "from → to" column. */
export function movementPlaces(m: { kind: StockMovementKind; fromLocation?: { name: string } | null; toLocation?: { name: string } | null }): string {
  if (m.kind === "ADJUST") return m.toLocation?.name ?? "—";
  return [m.fromLocation?.name, m.toLocation?.name].filter(Boolean).join(" → ") || "—";
}
