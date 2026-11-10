// Making one document from another: a job card from a quotation, an invoice from a job card.
// Used by the buttons on the documents and by workflows, so both do exactly the same thing.
import { QuotationStatus, type PrismaClient, type Settings } from "@prisma/client";
import { nextNumberIn } from "./settings";
import { addDays } from "./format";
import { contactForDoc, jobCardContactFields } from "./contacts";
import { logStatusChange } from "./statusLog";
import { labourLines, unbilled } from "./labour";
import { computeTotals } from "./totals";
import { emit } from "./workflows/events";

/** Marks a draft or sent quotation accepted, e.g. once work or an invoice is made from it. */
export async function markQuoteAccepted(db: PrismaClient, id: string) {
  const n = await db.quotation.updateMany({
    where: { id, status: { in: [QuotationStatus.DRAFT, QuotationStatus.SENT] } },
    data: { status: QuotationStatus.ACCEPTED },
  });
  if (n.count) await emit(db, "quote.status", id, { status: QuotationStatus.ACCEPTED });
}

/** A job card pre-filled from the quotation: customer, contact, site and the quoted work as the scope. */
export async function jobCardFromQuote(db: PrismaClient, quoteId: string, byName: string) {
  const q = await db.quotation.findUniqueOrThrow({
    where: { id: quoteId },
    include: { customer: true, contact: true, items: { orderBy: { sortOrder: "asc" } } },
  });
  const scope = [
    q.title,
    ...q.items.map((i) => `• ${i.description}${i.quantity !== 1 || i.unit ? ` (${i.quantity}${i.unit ? " " + i.unit : ""})` : ""}`),
  ]
    .filter(Boolean)
    .join("\n");
  const jc = await db.jobCard.create({
    data: {
      number: await nextNumberIn(db, "jobCard"),
      customerId: q.customerId,
      quotationId: q.id,
      contactId: q.contactId ?? (await contactForDoc(db, q.customerId, "")),
      siteAddress: q.siteAddress || q.customer.siteAddress || q.customer.billingAddress,
      ...jobCardContactFields(q.customer, q.contact),
      scopeOfWork: scope,
    },
  });
  await logStatusChange(db, jc.id, null, { status: jc.status, statusId: jc.statusId }, byName);
  await markQuoteAccepted(db, q.id);
  return jc;
}

/** A draft invoice from a job card: the quotation's lines plus labour not billed yet. */
export async function invoiceFromJobCard(db: PrismaClient, jobCardId: string, settings: Settings) {
  const jc = await db.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    include: { quotation: { include: { items: { orderBy: { sortOrder: "asc" } } } }, timeEntries: true },
  });
  const q = jc.quotation;
  const open = unbilled(jc.timeEntries);
  const users = await db.user.findMany({
    where: { id: { in: open.map((e) => e.userId).filter((x): x is string => !!x) } },
    select: { id: true, labourRate: true },
  });
  const labour = labourLines(open, users, settings);
  const items = [
    ...(q?.items ?? []).map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })),
    ...labour,
  ];
  const vatRate = q?.vatRate ?? settings.vatRate;
  const discount = q?.discount ?? 0;
  const now = new Date();
  const invoice = await db.invoice.create({
    data: {
      number: await nextNumberIn(db, "invoice"),
      customerId: jc.customerId,
      contactId: jc.contactId ?? q?.contactId ?? (await contactForDoc(db, jc.customerId, "")),
      jobCardId: jc.id,
      quotationId: q?.id ?? null,
      issueDate: now,
      dueDate: addDays(now, settings.invoiceDueDays),
      reference: [q?.number, jc.number].filter(Boolean).join(" / "),
      terms: settings.invoiceTerms,
      vatRate,
      discount,
      ...computeTotals(items, vatRate, discount),
      items: items.length ? { create: items.map((i, n) => ({ ...i, sortOrder: n })) } : undefined,
    },
  });
  if (open.length) await db.timeEntry.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { invoiceId: invoice.id } });
  await emit(db, "invoice.created", invoice.id);
  return { invoice, itemCount: items.length, withLabour: labour.length > 0 };
}
