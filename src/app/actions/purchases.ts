"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { num, optDate, str } from "@/lib/form";
import { getSettings, nextNumber } from "@/lib/settings";
import { maySend, poApprovalState } from "@/lib/approval";
import { applyMovement, roundQty } from "@/lib/inventory";
import { computeTotals } from "@/lib/totals";
import { PO_EDITABLE, PO_RECEIVABLE } from "@/lib/purchases";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const backTo = (fd: FormData, fallback: string) => {
  const b = str(fd, "returnTo");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
};

const lineSchema = z.array(
  z.object({
    itemId: z.string().default(""),
    description: z.string().trim().min(1).max(300),
    quantity: z.number().finite().positive(),
    unitCost: z.number().int().min(0),
  }),
);

async function poFor(id: string) {
  const db = await tenantDb();
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) go("/purchase-orders", "err", "Purchase order not found");
  return po!;
}

export async function savePurchaseOrder(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("purchases.edit");
  const settings = await getSettings();
  const id = str(fd, "id");
  const before = id ? await poFor(id) : null;
  const path = before ? `/purchase-orders/${before.id}/edit` : "/purchase-orders/new";
  if (before && !PO_EDITABLE.includes(before.status)) go(`/purchase-orders/${before.id}`, "err", "An ordered purchase order can't be changed.");
  let lines: z.infer<typeof lineSchema>;
  try {
    lines = lineSchema.parse(JSON.parse(str(fd, "lines") || "[]"));
  } catch {
    return go(path, "err", "Each line needs a description, a quantity above 0 and a price.");
  }
  const supplier = str(fd, "supplier").slice(0, 120);
  if (!supplier) go(path, "err", "Who is the supplier?");
  if (!lines.length) go(path, "err", "Add at least one line.");
  const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean))];
  const known = new Set((await db.stockItem.findMany({ where: { id: { in: itemIds } }, select: { id: true } })).map((i) => i.id));
  const vatRate = num(fd, "vatRate", settings.vatRate);
  const totals = computeTotals(lines.map((l) => ({ description: l.description, quantity: l.quantity, unit: "", unitPrice: l.unitCost })), vatRate, 0);
  const locationId = str(fd, "locationId");
  const location = locationId ? await db.stockLocation.findUnique({ where: { id: locationId }, select: { id: true } }) : null;
  // A changed total needs approving again.
  const keepApproval = !!before?.approvedAt && before.total === totals.total;
  const data = {
    supplier,
    supplierEmail: str(fd, "supplierEmail").slice(0, 200),
    supplierRef: str(fd, "supplierRef").slice(0, 80),
    locationId: location?.id ?? null,
    expectedAt: optDate(fd, "expectedAt"),
    notes: str(fd, "notes").slice(0, 3000),
    vatRate,
    ...totals,
    ...(keepApproval ? {} : { approvedAt: null, approvedBy: "", status: before?.approvalRequestedAt ? ("AWAITING_APPROVAL" as const) : ("DRAFT" as const) }),
  };
  const lineRows = lines.map((l, i) => ({ itemId: known.has(l.itemId) ? l.itemId : null, description: l.description, quantity: roundQty(l.quantity), unitCost: l.unitCost, sortOrder: i }));
  const po = before
    ? await db.$transaction(async (tx) => {
        await tx.purchaseOrderLine.deleteMany({ where: { poId: before.id } });
        return tx.purchaseOrder.update({ where: { id: before.id }, data: { ...data, lines: { create: lineRows } } });
      })
    : await db.purchaseOrder.create({ data: { ...data, number: await nextNumber("po"), createdById: user.id, createdBy: user.name, lines: { create: lineRows } } });
  revalidatePath("/purchase-orders");
  go(`/purchase-orders/${po.id}`, "msg", before ? "Purchase order saved" : `Purchase order ${po.number} created`);
}

export async function requestPoApproval(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("purchases.edit");
  const po = await poFor(str(fd, "id"));
  if (!PO_EDITABLE.includes(po.status)) go(`/purchase-orders/${po.id}`, "err", "It has already been ordered.");
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "AWAITING_APPROVAL", approvalRequestedAt: new Date(), approvalRequestedBy: user.name, approvalNote: "" } });
  revalidatePath("/purchase-orders");
  go(`/purchase-orders/${po.id}`, "msg", "Sent for approval");
}

export async function approvePo(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("purchases.approve");
  const po = await poFor(str(fd, "id"));
  if (!PO_EDITABLE.includes(po.status)) go(`/purchase-orders/${po.id}`, "err", "It has already been ordered.");
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy: user.name, approvalNote: "" } });
  revalidatePath("/purchase-orders");
  go(backTo(fd, `/purchase-orders/${po.id}`), "msg", `${po.number} approved`);
}

export async function rejectPo(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("purchases.approve");
  const po = await poFor(str(fd, "id"));
  const note = str(fd, "note").slice(0, 500);
  if (!note) go(backTo(fd, `/purchase-orders/${po.id}`), "err", "Say why it is sent back, so it can be fixed.");
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "DRAFT", approvalRequestedAt: null, approvedAt: null, approvedBy: "", approvalNote: note } });
  revalidatePath("/purchase-orders");
  go(backTo(fd, `/purchase-orders/${po.id}`), "msg", `${po.number} sent back`);
}

/** Mark it as sent to the supplier. Needs approval first when that is switched on. */
export async function markPoOrdered(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("purchases.edit");
  const po = await poFor(str(fd, "id"));
  if (!PO_EDITABLE.includes(po.status)) go(`/purchase-orders/${po.id}`, "err", "It has already been ordered.");
  if (!maySend(poApprovalState(po, await getSettings()))) go(`/purchase-orders/${po.id}`, "err", "This purchase order needs approval before it can be ordered.");
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "ORDERED", orderedAt: new Date() } });
  revalidatePath("/purchase-orders");
  go(`/purchase-orders/${po.id}`, "msg", "Marked as ordered");
}

/** Book in a delivery: stock lines go into the chosen location at the order's price. */
export async function receivePo(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("purchases.edit");
  const po = await poFor(str(fd, "id"));
  const path = `/purchase-orders/${po.id}`;
  if (!PO_RECEIVABLE.includes(po.status)) go(path, "err", "Only an ordered purchase order can be received.");
  const got = po.lines
    .map((l) => ({ line: l, qty: roundQty(Math.max(0, Number(str(fd, `recv_${l.id}`).replace(",", ".")) || 0)) }))
    .filter((r) => r.qty > 0);
  if (!got.length) go(path, "err", "Enter how many of each line arrived.");
  const locationId = str(fd, "locationId");
  const needsLocation = got.some((r) => r.line.itemId);
  const location = locationId ? await db.stockLocation.findFirst({ where: { id: locationId, active: true }, select: { id: true } }) : null;
  if (needsLocation && !location) go(path, "err", "Choose where the stock goes.");
  await db.$transaction(async (tx) => {
    for (const { line, qty } of got) {
      if (line.itemId) {
        await applyMovement(tx, { itemId: line.itemId, kind: "RECEIVE", quantity: qty, toLocationId: location!.id, note: `${po.number} · ${po.supplier}`, userId: user.id, userName: user.name });
        // Receiving at the order's price updates the item's cost price, as with Inventory → Receive.
        await tx.stockItem.update({ where: { id: line.itemId }, data: { costPrice: line.unitCost } });
      }
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { received: { increment: qty } } });
    }
    const lines = await tx.purchaseOrderLine.findMany({ where: { poId: po.id } });
    const complete = lines.every((l) => l.received >= l.quantity - 1e-9);
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: complete ? "RECEIVED" : "PARTLY_RECEIVED" } });
  });
  revalidatePath("/purchase-orders");
  revalidatePath("/inventory");
  go(path, "msg", "Delivery booked in");
}

export async function cancelPo(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("purchases.edit");
  const po = await poFor(str(fd, "id"));
  if (po.status === "RECEIVED" || po.status === "CANCELLED") go(`/purchase-orders/${po.id}`, "err", "It is already closed.");
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: "CANCELLED" } });
  revalidatePath("/purchase-orders");
  go(`/purchase-orders/${po.id}`, "msg", "Purchase order cancelled");
}

export async function deletePo(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("purchases.delete");
  const po = await poFor(str(fd, "id"));
  if (po.lines.some((l) => l.received > 0)) go(`/purchase-orders/${po.id}`, "err", "Stock was received on it, so cancel it instead of deleting it.");
  await db.purchaseOrder.delete({ where: { id: po.id } });
  revalidatePath("/purchase-orders");
  go("/purchase-orders", "msg", `${po.number} deleted`);
}
