// Fills document templates from the records and stores the finished document.
import { Prisma, type PrismaClient, type DocTemplate } from "@prisma/client";
import { fmtDate, money } from "@/lib/format";
import { mergeFields, type DocItem, type DocSubject } from "./defs";

type Loaded = {
  data: Record<string, string>;
  items: DocItem[];
  links: { customerId: string; jobCardId?: string; quotationId?: string; invoiceId?: string };
  technicianId: string | null;
  label: string;
};

const DAY = 86400000;

/** Everything a template can use, for one record. Null when the record does not exist. */
export async function loadDocData(db: PrismaClient, subject: DocSubject, id: string): Promise<Loaded | null> {
  const s = await db.settings.findUnique({ where: { id: 1 } });
  if (!s) return null;
  const sym = s.currencySymbol;
  const base: Record<string, string> = {
    "doc.date": fmtDate(new Date()),
    "company.name": s.companyName,
    "company.address": s.address,
    "company.phone": s.phone,
    "company.email": s.email,
    "company.website": s.website,
    "company.vatNumber": s.vatNumber,
    "company.regNumber": s.regNumber,
    "company.pcoNumber": s.pcoNumber,
    "company.bank": [s.bankName, s.bankAccountName, s.bankAccountNumber && `Account ${s.bankAccountNumber}`, s.bankBranchCode && `Branch code ${s.bankBranchCode}`].filter(Boolean).join(" · "),
  };
  const customerFields = (c: { name: string; contactPerson: string; email: string; phone: string; billingAddress: string; siteAddress: string; vatNumber: string; regNumber: string }) => ({
    "customer.name": c.name,
    "customer.contact": c.contactPerson || c.name,
    "customer.email": c.email,
    "customer.phone": c.phone,
    "customer.billingAddress": c.billingAddress,
    "customer.siteAddress": c.siteAddress || c.billingAddress,
    "customer.vatNumber": c.vatNumber,
    "customer.regNumber": c.regNumber,
  });
  const itemsOf = (rows: { description: string; quantity: number; unit: string; unitPrice: number }[]) =>
    rows.map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice }));

  switch (subject) {
    case "customer": {
      const c = await db.customer.findUnique({ where: { id } });
      if (!c) return null;
      return { data: { ...base, ...customerFields(c) }, items: [], links: { customerId: c.id }, technicianId: null, label: c.name };
    }
    case "quote": {
      const q = await db.quotation.findUnique({ where: { id }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } } } });
      if (!q) return null;
      return {
        data: {
          ...base,
          ...customerFields(q.customer),
          "quote.number": q.number,
          "quote.date": fmtDate(q.issueDate),
          "quote.validUntil": fmtDate(q.validUntil),
          "quote.title": q.title,
          "quote.siteAddress": q.siteAddress || q.customer.siteAddress || q.customer.billingAddress,
          "quote.subtotal": money(q.subtotal, sym),
          "quote.vat": money(q.vatAmount, sym),
          "quote.total": money(q.total, sym),
          "quote.notes": q.notes,
          "quote.terms": q.terms || s.quoteTerms,
        },
        items: itemsOf(q.items),
        links: { customerId: q.customerId, quotationId: q.id },
        technicianId: null,
        label: q.number,
      };
    }
    case "job": {
      const j = await db.jobCard.findUnique({
        where: { id },
        include: { customer: true, technicianUser: { select: { name: true } }, quotation: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
      });
      if (!j) return null;
      const products = [...j.activeIngredients, ...(j.activeIngredientOther ? [j.activeIngredientOther] : [])].join(", ");
      return {
        data: {
          ...base,
          ...customerFields(j.customer),
          "job.number": j.number,
          "job.date": fmtDate(j.jobDate ?? j.scheduledStart),
          "job.type": j.jobType,
          "job.technician": j.technicianUser?.name || j.technician,
          "job.siteAddress": j.siteAddress || j.customer.siteAddress || j.customer.billingAddress,
          "job.siteContact": j.siteContact,
          "job.scope": j.scopeOfWork,
          "job.areaTreated": j.areaTreated,
          "job.workDone": j.workDescription,
          "job.products": products,
          "job.warrantyNo": j.warrantyNo || j.number,
          "job.warrantyStart": fmtDate(j.warrantyStart ?? j.jobDate),
          "job.warrantyEnd": fmtDate(j.warrantyEnd),
          "job.warrantyCovers": j.warrantyCovers.join(", "),
          "job.warrantyTerms": s.warrantyTerms
            .split("\n")
            .filter((l) => l.trim())
            .map((l) => `- ${l.trim()}`)
            .join("\n"),
          "job.signedBy": j.customerSignName,
          "job.signedDate": fmtDate(j.signedAt),
          "job.quote": j.quotation?.number ?? "",
        },
        items: itemsOf(j.quotation?.items ?? []),
        links: { customerId: j.customerId, jobCardId: j.id, ...(j.quotationId ? { quotationId: j.quotationId } : {}) },
        technicianId: j.technicianId,
        label: j.number,
      };
    }
    case "invoice": {
      const inv = await db.invoice.findUnique({ where: { id }, include: { customer: true, items: { orderBy: { sortOrder: "asc" } } } });
      if (!inv) return null;
      const overdue = Math.max(0, Math.floor((Date.now() - inv.dueDate.getTime()) / DAY));
      return {
        data: {
          ...base,
          ...customerFields(inv.customer),
          "invoice.number": inv.number,
          "invoice.date": fmtDate(inv.issueDate),
          "invoice.dueDate": fmtDate(inv.dueDate),
          "invoice.reference": inv.reference,
          "invoice.total": money(inv.total, sym),
          "invoice.paid": money(inv.amountPaid, sym),
          "invoice.balance": money(Math.max(0, inv.total - inv.amountPaid), sym),
          "invoice.daysOverdue": String(overdue),
        },
        items: itemsOf(inv.items),
        links: { customerId: inv.customerId, invoiceId: inv.id, ...(inv.jobCardId ? { jobCardId: inv.jobCardId } : {}) },
        technicianId: null,
        label: inv.number,
      };
    }
  }
}

/** The template's next number, reserved. */
async function reserveNumber(db: PrismaClient, t: DocTemplate): Promise<string> {
  const row = await db.docTemplate.update({ where: { id: t.id }, data: { nextNo: { increment: 1 } }, select: { nextNo: true, prefix: true } });
  return `${row.prefix}${String(row.nextNo - 1).padStart(4, "0")}`;
}

/**
 * Makes a document from a template for a record and stores it. The text is merged now, so the
 * document stays as issued even if the record changes later.
 */
export async function generateDocument(db: PrismaClient, templateId: string, subjectId: string, by: { id?: string | null; name: string }) {
  const t = await db.docTemplate.findUnique({ where: { id: templateId } });
  if (!t) throw new Error("That template no longer exists");
  const loaded = await loadDocData(db, t.appliesTo as DocSubject, subjectId);
  if (!loaded) throw new Error("The record it is for no longer exists");
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 }, select: { pcoSignature: true } });
  // Two templates may share a prefix (e.g. LET-), so skip numbers already used.
  for (let attempt = 0; attempt < 50; attempt++) {
    const number = await reserveNumber(db, t);
    const data = { ...loaded.data, "doc.number": number };
    try {
      return await db.generatedDoc.create({
        data: {
          number,
          templateId: t.id,
          name: t.name,
          title: mergeFields(t.title, data),
          body: mergeFields(t.body, data),
          items: loaded.items,
          letterhead: t.letterhead,
          showInPortal: t.showInPortal,
          ...loaded.links,
          companySignature: settings.pcoSignature,
          companySigner: loaded.data["job.technician"] || by.name,
          createdById: by.id ?? null,
          createdBy: by.name.slice(0, 120),
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  throw new Error("Could not find a free document number; change the template's prefix");
}

