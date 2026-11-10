// The shape of records in the API (/api/v1) and in webhook messages. Amounts are in rands with
// cents as decimals (1150.5 = R1 150,50), dates are ISO 8601 in UTC. Signatures and photos are left out.
import type { Prisma, PrismaClient } from "@prisma/client";
import type { Subject } from "@/lib/workflows/defs";
import { parseFields } from "@/lib/forms";

const r = (cents: number) => Math.round(cents) / 100;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------- Customers ----------

export const customerInclude = {
  contacts: { where: { archived: false }, orderBy: [{ isPrimary: "desc" }, { name: "asc" }] },
  branch: { select: { id: true, name: true } },
} satisfies Prisma.CustomerInclude;
type CustomerRow = Prisma.CustomerGetPayload<{ include: typeof customerInclude }>;

export const customerOut = (c: CustomerRow) => ({
  id: c.id,
  type: c.type.toLowerCase(),
  name: c.name,
  contactPerson: c.contactPerson,
  email: c.email,
  phone: c.phone,
  altPhone: c.altPhone,
  vatNumber: c.vatNumber,
  regNumber: c.regNumber,
  billingAddress: c.billingAddress,
  siteAddress: c.siteAddress,
  notes: c.notes,
  leadSource: c.leadSource,
  branch: c.branch,
  archived: c.archived,
  contacts: c.contacts.map((k) => ({ id: k.id, name: k.name, role: k.role, email: k.email, phone: k.phone, mobile: k.mobile, isPrimary: k.isPrimary })),
  createdAt: iso(c.createdAt),
  updatedAt: iso(c.updatedAt),
});

const customerRef = { select: { id: true, name: true, email: true } } as const;

// ---------- Quotations ----------

export const quoteInclude = { customer: customerRef, items: { orderBy: { sortOrder: "asc" } } } satisfies Prisma.QuotationInclude;
type QuoteRow = Prisma.QuotationGetPayload<{ include: typeof quoteInclude }>;

const itemOut = (i: { description: string; quantity: number; unit: string; unitPrice: number }) => ({
  description: i.description,
  quantity: i.quantity,
  unit: i.unit,
  unitPrice: r(i.unitPrice),
  amount: r(Math.round(i.quantity * i.unitPrice)),
});

export const quoteOut = (q: QuoteRow) => ({
  id: q.id,
  number: q.number,
  status: q.status,
  title: q.title,
  customer: q.customer,
  contactId: q.contactId,
  issueDate: iso(q.issueDate),
  validUntil: iso(q.validUntil),
  siteAddress: q.siteAddress,
  notes: q.notes,
  subtotal: r(q.subtotal),
  discount: r(q.discount),
  vatRate: q.vatRate,
  vat: r(q.vatAmount),
  total: r(q.total),
  response: q.response || null,
  respondedAt: iso(q.respondedAt),
  items: q.items.map(itemOut),
  createdAt: iso(q.createdAt),
  updatedAt: iso(q.updatedAt),
});

// ---------- Job cards ----------

export const jobInclude = {
  customer: customerRef,
  customStatus: { select: { name: true } },
  technicianUser: { select: { id: true, name: true, email: true } },
} satisfies Prisma.JobCardInclude;
type JobRow = Prisma.JobCardGetPayload<{ include: typeof jobInclude }>;

export const jobOut = (j: JobRow) => ({
  id: j.id,
  number: j.number,
  status: j.status,
  statusName: j.customStatus?.name ?? null,
  customer: j.customer,
  contactId: j.contactId,
  quotationId: j.quotationId,
  jobType: j.jobType,
  priority: j.priority,
  jobDate: iso(j.jobDate),
  scheduledStart: iso(j.scheduledStart),
  scheduledEnd: iso(j.scheduledEnd),
  technician: j.technicianUser ?? (j.technician ? { id: null, name: j.technician, email: null } : null),
  siteAddress: j.siteAddress,
  siteContact: j.siteContact,
  contactNumber: j.contactNumber,
  scopeOfWork: j.scopeOfWork,
  workDescription: j.workDescription,
  areaTreated: j.areaTreated,
  warranty: { number: j.warrantyNo, start: iso(j.warrantyStart), end: iso(j.warrantyEnd), covers: j.warrantyCovers },
  signedOff: j.signedAt ? { at: iso(j.signedAt), name: j.customerSignName, rating: j.customerRating, feedback: j.customerFeedback } : null,
  createdAt: iso(j.createdAt),
  updatedAt: iso(j.updatedAt),
});

// ---------- Invoices ----------

export const invoiceInclude = {
  customer: customerRef,
  items: { orderBy: { sortOrder: "asc" } },
  payments: { orderBy: { date: "asc" } },
} satisfies Prisma.InvoiceInclude;
type InvoiceRow = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

export const invoiceOut = (i: InvoiceRow) => ({
  id: i.id,
  number: i.number,
  status: i.status,
  customer: i.customer,
  contactId: i.contactId,
  quotationId: i.quotationId,
  jobCardId: i.jobCardId,
  issueDate: iso(i.issueDate),
  dueDate: iso(i.dueDate),
  reference: i.reference,
  subtotal: r(i.subtotal),
  discount: r(i.discount),
  vatRate: i.vatRate,
  vat: r(i.vatAmount),
  total: r(i.total),
  amountPaid: r(i.amountPaid),
  balance: r(Math.max(0, i.total - i.amountPaid)),
  items: i.items.map(itemOut),
  payments: i.payments.map((p) => ({ id: p.id, amount: r(p.amount), date: iso(p.date), method: p.method, reference: p.reference })),
  createdAt: iso(i.createdAt),
  updatedAt: iso(i.updatedAt),
});

// ---------- Queries ----------

export const queryInclude = { customer: customerRef, assignedTo: { select: { id: true, name: true } } } satisfies Prisma.QueryInclude;
type QueryRow = Prisma.QueryGetPayload<{ include: typeof queryInclude }>;

export const queryOut = (q: QueryRow) => ({
  id: q.id,
  number: q.number,
  status: q.status,
  priority: q.priority,
  subject: q.subject,
  description: q.description,
  category: q.category,
  source: q.source,
  customer: q.customer,
  assignedTo: q.assignedTo,
  dueAt: iso(q.dueAt),
  jobCardId: q.jobCardId,
  resolution: q.resolution,
  resolvedAt: iso(q.resolvedAt),
  createdAt: iso(q.createdAt),
  updatedAt: iso(q.updatedAt),
});

// ---------- Form submissions ----------

async function submissionOut(db: PrismaClient, id: string) {
  const s = await db.formSubmission.findUnique({ where: { id }, include: { form: { select: { id: true, name: true, fields: true } }, customer: customerRef } });
  if (!s) return null;
  const data = (s.data ?? {}) as Record<string, unknown>;
  const answers = parseFields(s.form.fields)
    .filter((f) => f.type !== "signature" && f.type !== "heading" && f.id in data)
    .map((f) => ({ question: f.label || f.id, answer: data[f.id] }));
  return {
    id: s.id,
    form: { id: s.form.id, name: s.form.name },
    source: s.source,
    summary: s.summary,
    customer: s.customer,
    jobCardId: s.jobCardId,
    queryId: s.queryId,
    answers,
    submittedBy: s.submittedBy,
    createdAt: iso(s.createdAt),
  };
}

/** The record a workflow event is about, in API shape, under its kind: { job: {...} }. Null when it is gone. */
export async function subjectData(db: PrismaClient, subject: Subject, id: string): Promise<Record<string, unknown> | null> {
  switch (subject) {
    case "customer": {
      const c = await db.customer.findUnique({ where: { id }, include: customerInclude });
      return c && { customer: customerOut(c) };
    }
    case "quote": {
      const q = await db.quotation.findUnique({ where: { id }, include: quoteInclude });
      return q && { quotation: quoteOut(q) };
    }
    case "job": {
      const j = await db.jobCard.findUnique({ where: { id }, include: jobInclude });
      return j && { jobCard: jobOut(j) };
    }
    case "invoice": {
      const i = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
      return i && { invoice: invoiceOut(i) };
    }
    case "query": {
      const q = await db.query.findUnique({ where: { id }, include: queryInclude });
      return q && { query: queryOut(q) };
    }
    case "submission": {
      const s = await submissionOut(db, id);
      return s && { submission: s };
    }
  }
}
