"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { StockLocationType } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { num, str } from "@/lib/form";
import { toCents } from "@/lib/format";
import { can, canAccessJobCard } from "@/lib/permissions";
import { applyMovement, roundQty } from "@/lib/inventory";
import { computeTotals } from "@/lib/totals";

const go = (path: string, kind: "msg" | "err", text: string, hash = ""): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}${hash}`);

const back = (fd: FormData, fallback: string) => {
  const to = str(fd, "returnTo");
  return to.startsWith("/") ? to : fallback;
};

// ---------- Items and locations ----------

export async function saveStockItem(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("inventory.manage");
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name"),
    sku: str(fd, "sku"),
    unit: str(fd, "unit") || "each",
    costPrice: Math.max(0, toCents(str(fd, "costPrice"))),
    sellPrice: Math.max(0, toCents(str(fd, "sellPrice"))),
    reorderLevel: Math.max(0, num(fd, "reorderLevel", 0)),
    notes: str(fd, "notes"),
    active: id ? fd.get("active") === "on" : true,
  };
  if (!data.name) go(back(fd, "/inventory"), "err", "The item needs a name.");
  const item = id ? await db.stockItem.update({ where: { id }, data }) : await db.stockItem.create({ data });
  revalidatePath("/inventory");
  go(id ? `/inventory/${item.id}` : "/inventory", "msg", "Item saved");
}

export async function deleteStockItem(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("inventory.delete");
  const id = str(fd, "id");
  const billed = await db.stockMovement.count({ where: { itemId: id, invoiceId: { not: null } } });
  if (billed) go(`/inventory/${id}`, "err", "This item is on invoices, so it can't be deleted. Untick “Active” to hide it.");
  await db.stockItem.delete({ where: { id } });
  go("/inventory", "msg", "Item deleted");
}

export async function saveStockLocation(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("inventory.manage");
  const id = str(fd, "id");
  const type = str(fd, "type") === "VAN" ? StockLocationType.VAN : StockLocationType.WAREHOUSE;
  const data = {
    name: str(fd, "name"),
    type,
    userId: type === "VAN" ? str(fd, "userId") || null : null,
    active: id ? fd.get("active") === "on" : true,
  };
  if (!data.name) go("/inventory", "err", "The location needs a name.", "#locations");
  if (id) await db.stockLocation.update({ where: { id }, data });
  else await db.stockLocation.create({ data });
  go("/inventory", "msg", "Location saved", "#locations");
}

// ---------- Stock movements ----------

function qtyFrom(fd: FormData): number {
  return roundQty(num(fd, "quantity", 0));
}

export async function receiveStock(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("inventory.manage");
  const to = back(fd, "/inventory");
  const itemId = str(fd, "itemId");
  const locationId = str(fd, "locationId");
  const quantity = qtyFrom(fd);
  if (!itemId || !locationId || quantity <= 0) go(to, "err", "Choose an item, a location and a quantity above 0.");
  const cost = str(fd, "costPrice");
  await db.$transaction(async (tx) => {
    await applyMovement(tx, { itemId, kind: "RECEIVE", quantity, toLocationId: locationId, note: str(fd, "note"), userId: user.id, userName: user.name });
    // Receiving at a new price updates the item's cost price.
    if (cost) await tx.stockItem.update({ where: { id: itemId }, data: { costPrice: Math.max(0, toCents(cost)) } });
  });
  revalidatePath("/inventory");
  go(to, "msg", "Stock received");
}

export async function transferStock(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("inventory.manage");
  const to = back(fd, "/inventory");
  const itemId = str(fd, "itemId");
  const fromLocationId = str(fd, "fromLocationId");
  const toLocationId = str(fd, "toLocationId");
  const quantity = qtyFrom(fd);
  if (!itemId || !fromLocationId || !toLocationId || quantity <= 0) go(to, "err", "Choose an item, both locations and a quantity above 0.");
  if (fromLocationId === toLocationId) go(to, "err", "Choose two different locations.");
  await db.$transaction((tx) => applyMovement(tx, { itemId, kind: "TRANSFER", quantity, fromLocationId, toLocationId, note: str(fd, "note"), userId: user.id, userName: user.name }));
  revalidatePath("/inventory");
  go(to, "msg", "Stock transferred");
}

/** Stock count: sets the level at a location to what was counted, recording the difference. */
export async function adjustStock(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("inventory.manage");
  const to = back(fd, "/inventory");
  const itemId = str(fd, "itemId");
  const locationId = str(fd, "locationId");
  const raw = str(fd, "counted");
  if (!itemId || !locationId || raw === "") go(to, "err", "Choose an item and a location, and enter the counted quantity.");
  const counted = roundQty(num(fd, "counted", 0));
  const level = await db.stockLevel.findUnique({ where: { itemId_locationId: { itemId, locationId } } });
  const delta = roundQty(counted - (level?.quantity ?? 0));
  if (delta === 0) go(to, "msg", "Count matches; nothing changed.");
  await db.$transaction((tx) => applyMovement(tx, { itemId, kind: "ADJUST", quantity: delta, toLocationId: locationId, note: str(fd, "note") || "Stock count", userId: user.id, userName: user.name }));
  revalidatePath("/inventory");
  go(to, "msg", "Stock count saved");
}

// ---------- Stock used on job cards ----------

export async function useStockOnJob(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("stock.use");
  const jobCardId = str(fd, "jobCardId");
  const path = `/job-cards/${jobCardId}`;
  const jc = await db.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, technicianId: true } });
  if (!jc) redirect("/job-cards");
  if (!canAccessJobCard(user, jc)) redirect("/no-access?need=jobcards.viewAll");
  const itemId = str(fd, "itemId");
  const locationId = str(fd, "locationId");
  const quantity = qtyFrom(fd);
  if (!itemId || !locationId || quantity <= 0) go(path, "err", "Choose a product, where it came from, and a quantity above 0.", "#stock");
  if (!can(user.role, "inventory.manage")) {
    // Technicians book stock out of their own van only.
    const van = await db.stockLocation.findFirst({ where: { id: locationId, type: "VAN", userId: user.id } });
    if (!van) go(path, "err", "You can only use stock from your own van.", "#stock");
  }
  await db.$transaction((tx) =>
    applyMovement(tx, { itemId, kind: "USE", quantity, fromLocationId: locationId, jobCardId, note: str(fd, "note"), userId: user.id, userName: user.name }),
  );
  revalidatePath(path);
  go(path, "msg", "Stock recorded", "#stock");
}

/** Takes back a "used on job" entry that has not been billed, returning the stock to where it came from. */
export async function undoStockUse(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("stock.use");
  const m = await db.stockMovement.findUnique({ where: { id: str(fd, "id") }, include: { jobCard: { select: { id: true, technicianId: true } } } });
  if (!m || m.kind !== "USE" || !m.jobCard) redirect("/job-cards");
  const path = `/job-cards/${m.jobCard.id}`;
  if (!canAccessJobCard(user, m.jobCard)) redirect("/no-access?need=jobcards.viewAll");
  if (!can(user.role, "inventory.manage") && m.userId !== user.id) go(path, "err", "You can only remove stock you recorded yourself.", "#stock");
  if (m.invoiceId) go(path, "err", "This stock is already on an invoice.", "#stock");
  await db.$transaction(async (tx) => {
    if (m.fromLocationId) {
      await tx.stockLevel.upsert({
        where: { itemId_locationId: { itemId: m.itemId, locationId: m.fromLocationId } },
        update: { quantity: { increment: m.quantity } },
        create: { itemId: m.itemId, locationId: m.fromLocationId, quantity: m.quantity },
      });
    }
    await tx.stockMovement.delete({ where: { id: m.id } });
  });
  revalidatePath(path);
  go(path, "msg", "Stock entry removed and returned", "#stock");
}

/** Adds the job's unbilled materials (at each item's sell price) to its newest draft invoice. */
export async function billMaterialsToDraft(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("materials.bill");
  const jobCardId = str(fd, "jobCardId");
  const path = `/job-cards/${jobCardId}`;
  const invoice = await db.invoice.findFirst({
    where: { jobCardId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    include: { items: true },
  });
  if (!invoice) go(path, "err", "There is no draft invoice for this job card. Create the invoice first, then add the materials.", "#stock");
  const used = await db.stockMovement.findMany({ where: { jobCardId, kind: "USE", invoiceId: null }, include: { item: true } });
  if (!used.length) go(path, "err", "There are no unbilled materials on this job card.", "#stock");
  // One line per product.
  const byItem = new Map<string, { description: string; quantity: number; unit: string; unitPrice: number }>();
  for (const m of used) {
    const line = byItem.get(m.itemId) ?? { description: m.item.name, quantity: 0, unit: m.item.unit, unitPrice: m.item.sellPrice };
    line.quantity = roundQty(line.quantity + m.quantity);
    byItem.set(m.itemId, line);
  }
  const inv = invoice!;
  const lines = [...byItem.values()];
  const totals = computeTotals([...inv.items, ...lines], inv.vatRate, inv.discount);
  await db.$transaction([
    db.invoiceItem.createMany({ data: lines.map((l, i) => ({ ...l, invoiceId: inv.id, sortOrder: inv.items.length + i })) }),
    db.invoice.update({ where: { id: inv.id }, data: { ...totals, approvedAt: null, approvedBy: "" } }),
    db.stockMovement.updateMany({ where: { id: { in: used.map((m) => m.id) } }, data: { invoiceId: inv.id } }),
  ]);
  revalidatePath(`/invoices/${inv.id}`);
  redirect(`/invoices/${inv.id}?msg=${encodeURIComponent(`Materials added from the job card (${lines.length} line${lines.length === 1 ? "" : "s"})`)}`);
}
