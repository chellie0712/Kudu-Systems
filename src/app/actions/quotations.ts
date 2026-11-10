"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { QuotationStatus } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { cents, num, optDate, parseItems, str } from "@/lib/form";
import { computeTotals } from "@/lib/totals";
import { getSettings, nextNumber } from "@/lib/settings";
import { addDays } from "@/lib/format";
import { contactForDoc } from "@/lib/contacts";
import { maySend, quoteApprovalState } from "@/lib/approval";
import { emit } from "@/lib/workflows/events";
import { jobCardFromQuote, markQuoteAccepted } from "@/lib/conversions";

/** Statuses that mean the quote went to the customer, so need approval first when it is switched on. */
const OUT_TO_CUSTOMER: QuotationStatus[] = [QuotationStatus.SENT, QuotationStatus.ACCEPTED];

export async function saveQuotation(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("quotations.edit");
  const settings = await getSettings();
  const id = str(fd, "id");
  const items = parseItems(fd);
  const vatRate = num(fd, "vatRate", settings.vatRate);
  const discount = cents(fd, "discount");
  const totals = computeTotals(items, vatRate, discount);
  const issueDate = optDate(fd, "issueDate") ?? new Date();
  const before = id ? await db.quotation.findUnique({ where: { id } }) : null;
  let status = (str(fd, "status") as QuotationStatus) || QuotationStatus.DRAFT;
  if (!(status in QuotationStatus)) status = QuotationStatus.DRAFT;
  // A changed total needs approving again.
  const keepApproval = !!before?.approvedAt && before.total === totals.total;
  const state = quoteApprovalState({ total: totals.total, approvedAt: keepApproval ? before!.approvedAt : null, approvalRequestedAt: before?.approvalRequestedAt ?? null }, settings);
  let notice = "Quotation saved";
  if (OUT_TO_CUSTOMER.includes(status) && !OUT_TO_CUSTOMER.includes(before?.status ?? QuotationStatus.DRAFT) && !maySend(state)) {
    status = before?.status ?? QuotationStatus.DRAFT;
    notice = "Saved, but not marked as sent: this quotation needs approval first.";
  }
  const data = {
    customerId: str(fd, "customerId"),
    title: str(fd, "title"),
    status,
    ...(keepApproval ? {} : { approvedAt: null, approvedBy: "" }),
    issueDate,
    validUntil: optDate(fd, "validUntil") ?? addDays(issueDate, settings.quoteValidityDays),
    siteAddress: str(fd, "siteAddress"),
    notes: str(fd, "notes"),
    terms: str(fd, "terms"),
    vatRate,
    discount,
    ...totals,
  };
  if (!data.customerId) throw new Error("Choose a customer");
  const contactId = await contactForDoc(db, data.customerId, str(fd, "contactId"));
  const itemRows = items.map((it, i) => ({ ...it, sortOrder: i }));

  const quote = id
    ? await db.$transaction(async (tx) => {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        return tx.quotation.update({ where: { id }, data: { ...data, contactId, items: { create: itemRows } } });
      })
    : await db.quotation.create({
        data: { ...data, contactId, number: await nextNumber("quote"), items: { create: itemRows } },
      });
  if (!id) await emit(db, "quote.created", quote.id);
  if (quote.status !== (before?.status ?? QuotationStatus.DRAFT)) await emit(db, "quote.status", quote.id, { status: quote.status });
  revalidatePath("/quotations");
  redirect(`/quotations/${quote.id}?msg=${encodeURIComponent(notice)}`);
}

export async function setQuotationStatus(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("quotations.edit");
  const id = str(fd, "id");
  const status = str(fd, "status") as QuotationStatus;
  if (!(status in QuotationStatus)) redirect(`/quotations/${id}?err=Unknown+status`);
  const q = await db.quotation.findUnique({ where: { id } });
  if (!q) redirect("/quotations");
  if (OUT_TO_CUSTOMER.includes(status) && !OUT_TO_CUSTOMER.includes(q.status) && !maySend(quoteApprovalState(q, await getSettings()))) {
    redirect(`/quotations/${id}?err=${encodeURIComponent("This quotation needs approval before it can be sent.")}`);
  }
  await db.quotation.update({ where: { id }, data: { status } });
  if (status !== q.status) await emit(db, "quote.status", id, { status });
  revalidatePath(`/quotations/${id}`);
  redirect(`/quotations/${id}?msg=Status+updated`);
}

export async function deleteQuotation(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("quotations.delete");
  const id = str(fd, "id");
  const q = await db.quotation.delete({ where: { id } });
  revalidatePath("/quotations");
  redirect(`/customers/${q.customerId}?tab=quotations&msg=Quotation+deleted`);
}


/** Create a job card pre-filled from the quotation, then open it for editing. */
export async function createJobCardFromQuotation(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("jobcards.create");
  await getSettings();
  const q = await db.quotation.findUniqueOrThrow({ where: { id: str(fd, "id") }, select: { id: true, number: true } });
  const jc = await jobCardFromQuote(db, q.id, user.name);
  revalidatePath("/job-cards");
  redirect(`/job-cards/${jc.id}/edit?msg=Job+card+created+from+${q.number}.+Set+the+date+and+technician.`);
}

/** Create an invoice that copies the quotation's line items and totals. */
export async function createInvoiceFromQuotation(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.edit");
  const settings = await getSettings();
  const q = await db.quotation.findUniqueOrThrow({
    where: { id: str(fd, "id") },
    include: { items: { orderBy: { sortOrder: "asc" } }, jobCards: { select: { id: true } } },
  });
  const now = new Date();
  const inv = await db.invoice.create({
    data: {
      number: await nextNumber("invoice"),
      customerId: q.customerId,
      contactId: q.contactId ?? (await contactForDoc(db, q.customerId, "")),
      quotationId: q.id,
      // Link the job card automatically only when there is exactly one.
      jobCardId: q.jobCards.length === 1 ? q.jobCards[0].id : null,
      issueDate: now,
      dueDate: addDays(now, settings.invoiceDueDays),
      reference: q.number,
      notes: q.notes,
      terms: settings.invoiceTerms,
      vatRate: q.vatRate,
      discount: q.discount,
      subtotal: q.subtotal,
      vatAmount: q.vatAmount,
      total: q.total,
      items: {
        create: q.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          sortOrder: i.sortOrder,
        })),
      },
    },
  });
  await emit(db, "invoice.created", inv.id);
  await markQuoteAccepted(db, q.id);
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}?msg=Invoice+created+from+${q.number}`);
}

// ---------- Approval ----------

export async function requestQuoteApproval(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("quotations.edit");
  const id = str(fd, "id");
  await db.quotation.update({ where: { id }, data: { approvalRequestedAt: new Date(), approvalRequestedBy: user.name, approvalNote: "" } });
  revalidatePath("/quotations");
  redirect(`/quotations/${id}?msg=Sent+for+approval`);
}

export async function approveQuote(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("quotations.approve");
  const id = str(fd, "id");
  await db.quotation.update({ where: { id }, data: { approvedAt: new Date(), approvedBy: user.name, approvalNote: "" } });
  revalidatePath("/quotations");
  const back = str(fd, "returnTo");
  redirect(back.startsWith("/approvals") ? `${back}?msg=Quotation+approved` : `/quotations/${id}?msg=Quotation+approved`);
}

/** Sends the quotation back to whoever submitted it, with a reason. */
export async function rejectQuote(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("quotations.approve");
  const id = str(fd, "id");
  const note = str(fd, "note");
  if (!note) redirect(`/quotations/${id}?err=${encodeURIComponent("Say why it is sent back, so it can be fixed.")}`);
  await db.quotation.update({ where: { id }, data: { approvalRequestedAt: null, approvedAt: null, approvedBy: "", approvalNote: note } });
  revalidatePath("/quotations");
  const back = str(fd, "returnTo");
  redirect(back.startsWith("/approvals") ? `${back}?msg=Quotation+sent+back` : `/quotations/${id}?msg=Quotation+sent+back`);
}
