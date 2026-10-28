"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { QuotationStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { cents, num, optDate, parseItems, str } from "@/lib/form";
import { computeTotals } from "@/lib/totals";
import { getSettings, nextNumber } from "@/lib/settings";
import { addDays } from "@/lib/format";

export async function saveQuotation(fd: FormData) {
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
    title: str(fd, "title"),
    status: (str(fd, "status") as QuotationStatus) || QuotationStatus.DRAFT,
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
  const itemRows = items.map((it, i) => ({ ...it, sortOrder: i }));

  const quote = id
    ? await db.$transaction(async (tx) => {
        await tx.quotationItem.deleteMany({ where: { quotationId: id } });
        return tx.quotation.update({ where: { id }, data: { ...data, items: { create: itemRows } } });
      })
    : await db.quotation.create({
        data: { ...data, number: await nextNumber("quote"), items: { create: itemRows } },
      });
  revalidatePath("/quotations");
  redirect(`/quotations/${quote.id}?msg=Quotation+saved`);
}

export async function setQuotationStatus(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  await db.quotation.update({ where: { id }, data: { status: str(fd, "status") as QuotationStatus } });
  revalidatePath(`/quotations/${id}`);
  redirect(`/quotations/${id}?msg=Status+updated`);
}

export async function deleteQuotation(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const q = await db.quotation.delete({ where: { id } });
  revalidatePath("/quotations");
  redirect(`/customers/${q.customerId}?tab=quotations&msg=Quotation+deleted`);
}

async function markAccepted(id: string) {
  await db.quotation.updateMany({
    where: { id, status: { in: [QuotationStatus.DRAFT, QuotationStatus.SENT] } },
    data: { status: QuotationStatus.ACCEPTED },
  });
}

/** Create a job card pre-filled from the quotation, then open it for editing. */
export async function createJobCardFromQuotation(fd: FormData) {
  await requireUser();
  const q = await db.quotation.findUniqueOrThrow({
    where: { id: str(fd, "id") },
    include: { customer: true, items: { orderBy: { sortOrder: "asc" } } },
  });
  const scope = [
    q.title,
    ...q.items.map((i) => `• ${i.description}${i.quantity !== 1 || i.unit ? ` (${i.quantity}${i.unit ? " " + i.unit : ""})` : ""}`),
  ]
    .filter(Boolean)
    .join("\n");
  const jc = await db.jobCard.create({
    data: {
      number: await nextNumber("jobCard"),
      customerId: q.customerId,
      quotationId: q.id,
      siteAddress: q.siteAddress || q.customer.siteAddress || q.customer.billingAddress,
      siteContact: q.customer.contactPerson || (q.customer.type === "INDIVIDUAL" ? q.customer.name : ""),
      contactNumber: q.customer.phone,
      scopeOfWork: scope,
    },
  });
  await markAccepted(q.id);
  revalidatePath("/job-cards");
  redirect(`/job-cards/${jc.id}/edit?msg=Job+card+created+from+${q.number}.+Set+the+date+and+technician.`);
}

/** Create an invoice that copies the quotation's line items and totals. */
export async function createInvoiceFromQuotation(fd: FormData) {
  await requireUser();
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
  await markAccepted(q.id);
  revalidatePath("/invoices");
  redirect(`/invoices/${inv.id}?msg=Invoice+created+from+${q.number}`);
}
