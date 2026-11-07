"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InvoiceStatus } from "@prisma/client";
import { requirePermission } from "@/auth";
import { approvalState, maySend } from "@/lib/approval";
import { tenantDb } from "@/lib/db";
import { cents, num, optDate, parseItems, str } from "@/lib/form";
import { computeTotals } from "@/lib/totals";
import { getSettings, nextNumber } from "@/lib/settings";
import { addDays } from "@/lib/format";
import { autoSend, removePayment } from "@/lib/accounting/sync";

/** Recalculate amount paid and set PAID / PARTIALLY_PAID / SENT accordingly. */
async function refreshPaymentStatus(invoiceId: string) {
  const db = await tenantDb();
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  const amountPaid = inv.payments.reduce((s, p) => s + p.amount, 0);
  let status = inv.status;
  if (inv.status !== InvoiceStatus.CANCELLED) {
    if (amountPaid >= inv.total && inv.total > 0) status = InvoiceStatus.PAID;
    else if (amountPaid > 0) status = InvoiceStatus.PARTIALLY_PAID;
    else if (inv.status === InvoiceStatus.PAID || inv.status === InvoiceStatus.PARTIALLY_PAID) status = InvoiceStatus.SENT;
  }
  await db.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status } });
}

export async function saveInvoice(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.edit");
  const settings = await getSettings();
  const id = str(fd, "id");
  const items = parseItems(fd);
  const vatRate = num(fd, "vatRate", settings.vatRate);
  const discount = cents(fd, "discount");
  const totals = computeTotals(items, vatRate, discount);
  const issueDate = optDate(fd, "issueDate") ?? new Date();
  const before = id ? await db.invoice.findUnique({ where: { id } }) : null;
  let status = (str(fd, "status") as InvoiceStatus) || InvoiceStatus.DRAFT;
  if (!(status in InvoiceStatus)) status = InvoiceStatus.DRAFT;
  // A changed total needs approving again.
  const keepApproval = before?.approvedAt && before.total === totals.total;
  const approval = keepApproval ? {} : { approvedAt: null, approvedBy: "" };
  const state = approvalState(
    { total: totals.total, approvedAt: keepApproval ? before!.approvedAt : null, approvalRequestedAt: before?.approvalRequestedAt ?? null },
    settings,
  );
  let notice = "";
  if (status === InvoiceStatus.SENT && before?.status !== InvoiceStatus.SENT && !maySend(state)) {
    status = before?.status ?? InvoiceStatus.DRAFT;
    notice = "Saved, but not marked as sent: this invoice needs approval first.";
  }
  const data = {
    customerId: str(fd, "customerId"),
    status,
    ...approval,
    issueDate,
    dueDate: optDate(fd, "dueDate") ?? addDays(issueDate, settings.invoiceDueDays),
    reference: str(fd, "reference"),
    notes: str(fd, "notes"),
    terms: str(fd, "terms"),
    jobCardId: str(fd, "jobCardId") || null,
    vatRate,
    discount,
    ...totals,
  };
  if (!data.customerId) throw new Error("Choose a customer");
  const itemRows = items.map((it, i) => ({ ...it, sortOrder: i }));

  const inv = id
    ? await db.$transaction(async (tx) => {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });
        return tx.invoice.update({ where: { id }, data: { ...data, items: { create: itemRows } } });
      })
    : await db.invoice.create({ data: { ...data, number: await nextNumber("invoice"), items: { create: itemRows } } });
  await refreshPaymentStatus(inv.id);
  await autoSend(db, inv.id);
  revalidatePath("/invoices");
  const approvalLost = before?.approvedAt && !keepApproval ? " The total changed, so it needs approving again." : "";
  redirect(`/invoices/${inv.id}?msg=Invoice+saved${notice || approvalLost ? `&err=${encodeURIComponent((notice + approvalLost).trim())}` : ""}`);
}

export async function setInvoiceStatus(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.edit");
  const id = str(fd, "id");
  const status = str(fd, "status") as InvoiceStatus;
  if (!(status in InvoiceStatus)) redirect(`/invoices/${id}?err=Unknown+status`);
  if (status === InvoiceStatus.SENT) {
    const [inv, settings] = await Promise.all([db.invoice.findUniqueOrThrow({ where: { id } }), getSettings()]);
    if (!maySend(approvalState(inv, settings))) redirect(`/invoices/${id}?err=${encodeURIComponent("This invoice needs approval before it can be sent.")}`);
  }
  await db.invoice.update({ where: { id }, data: { status } });
  if (str(fd, "status") !== InvoiceStatus.CANCELLED) await refreshPaymentStatus(id);
  await autoSend(db, id);
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?msg=Status+updated`);
}

export async function recordPayment(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("payments.record");
  const invoiceId = str(fd, "invoiceId");
  const amount = cents(fd, "amount");
  if (amount <= 0) redirect(`/invoices/${invoiceId}?err=Enter+a+payment+amount`);
  await db.payment.create({
    data: {
      invoiceId,
      amount,
      date: optDate(fd, "date") ?? new Date(),
      method: str(fd, "method") || "EFT",
      reference: str(fd, "reference"),
    },
  });
  await refreshPaymentStatus(invoiceId);
  await autoSend(db, invoiceId);
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}?msg=Payment+recorded`);
}

export async function deletePayment(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("payments.delete");
  const p = await db.payment.delete({ where: { id: str(fd, "id") } });
  await removePayment(db, p).catch(() => undefined);
  await refreshPaymentStatus(p.invoiceId);
  revalidatePath(`/invoices/${p.invoiceId}`);
  redirect(`/invoices/${p.invoiceId}?msg=Payment+removed`);
}

export async function deleteInvoice(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.delete");
  const inv = await db.invoice.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/invoices");
  redirect(`/customers/${inv.customerId}?tab=invoices&msg=Invoice+deleted`);
}

// ---------- Approval ----------

export async function requestInvoiceApproval(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("invoices.edit");
  const id = str(fd, "id");
  await db.invoice.update({ where: { id }, data: { approvalRequestedAt: new Date(), approvalRequestedBy: user.name, approvalNote: "" } });
  revalidatePath("/invoices");
  redirect(`/invoices/${id}?msg=Sent+for+approval`);
}

export async function approveInvoice(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("invoices.approve");
  const id = str(fd, "id");
  await db.invoice.update({ where: { id }, data: { approvedAt: new Date(), approvedBy: user.name, approvalNote: "" } });
  await autoSend(db, id);
  revalidatePath("/invoices");
  redirect(`/invoices/${id}?msg=Invoice+approved`);
}

/** Sends the invoice back to whoever submitted it, with a reason. */
export async function rejectInvoice(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.approve");
  const id = str(fd, "id");
  const note = str(fd, "note");
  if (!note) redirect(`/invoices/${id}?err=${encodeURIComponent("Say why it is sent back, so it can be fixed.")}`);
  await db.invoice.update({ where: { id }, data: { approvalRequestedAt: null, approvedAt: null, approvedBy: "", approvalNote: note } });
  revalidatePath("/invoices");
  redirect(`/invoices/${id}?msg=Invoice+sent+back`);
}
