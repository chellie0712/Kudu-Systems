// What is waiting for the signed-in user's approval, for the Approvals page, the menu badge and
// the dashboard. Each kind shows only to people with that kind's approve permission, and nobody
// sees their own expense claims or leave unless they may approve their own (built-in Admin).
import type { Prisma, Settings } from "@prisma/client";
import type { TenantDb } from "./db";
import { can, type Access } from "./permissions";
import { mayDecideOwn } from "./approval";

type Who = { id: string } & Exclude<Access, string>;

function filters(user: Who, settings: Pick<Settings, "invoiceApproval">) {
  const notMine = mayDecideOwn(user) ? {} : { NOT: { userId: user.id } };
  return {
    invoices: can(user, "invoices.approve") && settings.invoiceApproval
      ? ({ approvalRequestedAt: { not: null }, approvedAt: null, status: { not: "CANCELLED" } } satisfies Prisma.InvoiceWhereInput)
      : null,
    quotes: can(user, "quotations.approve") ? ({ approvalRequestedAt: { not: null }, approvedAt: null, status: "DRAFT" } satisfies Prisma.QuotationWhereInput) : null,
    pos: can(user, "purchases.approve") ? ({ status: "AWAITING_APPROVAL" } satisfies Prisma.PurchaseOrderWhereInput) : null,
    claims: can(user, "expenses.approve")
      ? ({ status: "SUBMITTED", claimantId: { not: null }, ...(mayDecideOwn(user) ? {} : { NOT: { claimantId: user.id } }) } satisfies Prisma.ExpenseWhereInput)
      : null,
    leave: can(user, "leave.approve") ? ({ status: "PENDING", ...notMine } satisfies Prisma.LeaveRequestWhereInput) : null,
  };
}

/** Whether the user approves anything at all (shows the Approvals menu item). */
export const approvesAnything = (user: Exclude<Access, string>) =>
  (["invoices.approve", "quotations.approve", "purchases.approve", "expenses.approve", "leave.approve"] as const).some((p) => can(user, p));

export async function approvalCount(db: TenantDb, user: Who, settings: Pick<Settings, "invoiceApproval">): Promise<number> {
  const f = filters(user, settings);
  const counts = await Promise.all([
    f.invoices ? db.invoice.count({ where: f.invoices }) : 0,
    f.quotes ? db.quotation.count({ where: f.quotes }) : 0,
    f.pos ? db.purchaseOrder.count({ where: f.pos }) : 0,
    f.claims ? db.expense.count({ where: f.claims }) : 0,
    f.leave ? db.leaveRequest.count({ where: f.leave }) : 0,
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

export async function approvalLists(db: TenantDb, user: Who, settings: Pick<Settings, "invoiceApproval">) {
  const f = filters(user, settings);
  const customer = { select: { name: true } };
  const [invoices, quotes, pos, claims, leave] = await Promise.all([
    f.invoices ? db.invoice.findMany({ where: f.invoices, include: { customer }, orderBy: { approvalRequestedAt: "asc" } }) : null,
    f.quotes ? db.quotation.findMany({ where: f.quotes, include: { customer }, orderBy: { approvalRequestedAt: "asc" } }) : null,
    f.pos ? db.purchaseOrder.findMany({ where: f.pos, include: { _count: { select: { lines: true } } }, orderBy: { approvalRequestedAt: "asc" } }) : null,
    f.claims ? db.expense.findMany({ where: f.claims, omit: { receipt: true }, orderBy: { submittedAt: "asc" } }) : null,
    f.leave ? db.leaveRequest.findMany({ where: f.leave, include: { user: { select: { name: true, email: true } } }, orderBy: { startDate: "asc" } }) : null,
  ]);
  const receiptIds = claims?.length
    ? new Set((await db.expense.findMany({ where: { id: { in: claims.map((c) => c.id) }, receipt: { not: null } }, select: { id: true } })).map((c) => c.id))
    : new Set<string>();
  return { invoices, quotes, pos, claims: claims?.map((c) => ({ ...c, hasReceipt: receiptIds.has(c.id) })) ?? null, leave };
}
