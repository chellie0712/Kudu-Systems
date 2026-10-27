"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { InvoiceStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { cents, num, optDate, parseItems, str } from "@/lib/form";
import { computeTotals } from "@/lib/totals";
import { getSettings, nextNumber } from "@/lib/settings";
import { addDays } from "@/lib/format";

/** Recalculate amount paid and set PAID / PARTIALLY_PAID / SENT accordingly. */
async function refreshPaymentStatus(invoiceId: string) {
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
  await requireUser();
  const settings = await getSettings();
  const id = str(fd, "id");
  const items = parseItems(fd);
  const vatRate = num(fd, "vatRate", settings.vatRate);
  const discount = cents(fd, "discount");
  const totals = computeTotals(items, vatRate, discount);
  const issueDate = optDate(fd, "issueDate") ?? new Date();
  const data = {
    customerId: str(fd, "customerId"),
    status: (str(fd, "status") as InvoiceStatus) || InvoiceStatus.DRAFT,
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
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}?msg=Invoice+saved`);
}

export async function setInvoiceStatus(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  await db.invoice.update({ where: { id }, data: { status: str(fd, "status") as InvoiceStatus } });
  if (str(fd, "status") !== InvoiceStatus.CANCELLED) await refreshPaymentStatus(id);
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?msg=Status+updated`);
}

export async function recordPayment(fd: FormData) {
  await requireUser();
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
  revalidatePath(`/invoices/${invoiceId}`);
  redirect(`/invoices/${invoiceId}?msg=Payment+recorded`);
}

export async function deletePayment(fd: FormData) {
  await requireUser();
  const p = await db.payment.delete({ where: { id: str(fd, "id") } });
  await refreshPaymentStatus(p.invoiceId);
  revalidatePath(`/invoices/${p.invoiceId}`);
  redirect(`/invoices/${p.invoiceId}?msg=Payment+removed`);
}

export async function deleteInvoice(fd: FormData) {
  await requireUser();
  const inv = await db.invoice.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/invoices");
  redirect(`/customers/${inv.customerId}?tab=invoices&msg=Invoice+deleted`);
}
