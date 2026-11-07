import { createHash } from "node:crypto";
import type { Customer, Invoice, InvoiceItem, PrismaClient, Settings } from "@prisma/client";
import { dayKey } from "@/lib/format";
import { apiAdapter, shortName } from "./index";
import { ctxFor, linkKey, loadLink } from "./store";
import { AccountingError, type ApiAdapter, type Ctx, type CustomerData, type InvoiceData, type Link } from "./types";

// The sync engine shared by every API package: what to send, when, and what to keep on the
// Kudu records. The adapters only translate. IDs kept on a customer/invoice/payment are only
// trusted when their acctLink matches the current "provider:organisation", so switching package
// or organisation never sends to the wrong books.

type Db = Pick<PrismaClient, "settings" | "customer" | "invoice" | "payment" | "accountingLink">;

export type Active = { settings: Settings; adapter: ApiAdapter; link: Link; key: string };

/** The company's connected API package, or null (none chosen, Pastel, or not finished). */
export async function activeLink(db: Db): Promise<Active | null> {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  const adapter = apiAdapter(settings?.accountingProvider);
  if (!settings || !adapter || !adapter.configured()) return null;
  const link = await loadLink(db, adapter.id);
  if (!link || Object.keys(link.credentials).length === 0) return null;
  if (adapter.needsOrg && !link.orgId) return null;
  return { settings, adapter, link, key: linkKey(link) };
}

/** Same check without loading credentials, for screens. */
export function linkReady(settings: Settings, link: { credentials: string | null; orgId: string } | null): boolean {
  const adapter = apiAdapter(settings.accountingProvider);
  return !!adapter && adapter.configured() && !!link?.credentials && (!adapter.needsOrg || !!link.orgId);
}

type InvoiceForHash = Pick<Invoice, "customerId" | "issueDate" | "dueDate" | "reference" | "notes" | "vatRate" | "discount" | "total"> & {
  items: Pick<InvoiceItem, "description" | "quantity" | "unit" | "unitPrice">[];
};

/** Changes only when something the package shows changes (not payments or status). */
export function invoiceHash(inv: InvoiceForHash): string {
  const parts = [inv.customerId, dayKey(inv.issueDate), dayKey(inv.dueDate), inv.reference, inv.notes, inv.vatRate, inv.discount, inv.total,
    ...inv.items.map((i) => [i.description, i.quantity, i.unit, i.unitPrice].join("|"))];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export function customerData(c: Customer): CustomerData {
  return {
    id: c.id,
    name: c.name,
    contactPerson: c.contactPerson,
    email: c.email,
    phone: c.phone,
    altPhone: c.altPhone,
    vatNumber: c.vatNumber,
    billingAddress: c.billingAddress,
    siteAddress: c.siteAddress,
  };
}

export function invoiceData(inv: Invoice & { items: InvoiceItem[] }): InvoiceData {
  return {
    id: inv.id,
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    reference: inv.reference,
    notes: inv.notes,
    vatRate: inv.vatRate,
    subtotal: inv.subtotal,
    discount: inv.discount,
    discountPct: inv.subtotal > 0 && inv.discount > 0 ? Math.round((inv.discount / inv.subtotal) * 1000000) / 10000 : 0,
    vatAmount: inv.vatAmount,
    total: inv.total,
    items: inv.items.map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })),
  };
}

const msg = (e: unknown, who: string) => (e instanceof AccountingError ? e.message : `Sending to ${who} failed: ${e instanceof Error ? e.message : String(e)}`).slice(0, 500);

async function requireActive(db: Db): Promise<Active & { ctx: Ctx }> {
  const a = await activeLink(db);
  if (!a) throw new AccountingError("No accounting package is connected. Set it up in Settings → Accounting.");
  return { ...a, ctx: await ctxFor(db, a.adapter.id) };
}

async function sendCustomer(db: Db, a: Active & { ctx: Ctx }, customerId: string): Promise<string> {
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const existing = c.acctLink === a.key ? c.acctId : null;
  const id = await a.adapter.upsertCustomer(a.ctx, customerData(c), existing);
  if (id !== existing) await db.customer.update({ where: { id: c.id }, data: { acctId: id, acctLink: a.key } });
  return id;
}

/** Sends (or re-sends) one issued invoice. Throws AccountingError; the error is also kept on the invoice. */
export async function sendInvoice(db: Db, invoiceId: string): Promise<{ number: string; who: string }> {
  let who = "the accounting package";
  try {
    const a = await requireActive(db);
    who = shortName(a.adapter.id);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    const existing = inv.acctLink === a.key ? inv.acctId : null;
    if (inv.status === "DRAFT") throw new AccountingError(`Drafts are not sent to ${who}. Mark the invoice as sent first.`);
    if (inv.status === "CANCELLED") {
      throw new AccountingError(existing ? `Cancelled in Kudu. Kudu does not delete invoices in ${who}: void it or issue a credit note there.` : `Cancelled invoices are not sent to ${who}.`);
    }
    const customerId = await sendCustomer(db, a, inv.customerId);
    const saved = await a.adapter.upsertInvoice(a.ctx, invoiceData(inv), customerId, existing, { useKuduNumber: a.settings.acctUseKuduNumbers });
    const warning =
      typeof saved.total === "number" && Math.abs(saved.total - inv.total) > 1
        ? `${who}'s total (R ${(saved.total / 100).toFixed(2)}) differs from Kudu's. Check the tax type and discount in ${who}.`
        : "";
    await db.invoice.update({
      where: { id: inv.id },
      data: { acctId: saved.id, acctLink: a.key, acctNumber: saved.number, acctSentAt: new Date(), acctError: warning, acctHash: invoiceHash(inv) },
    });
    return { number: saved.number, who };
  } catch (e) {
    const message = msg(e, who);
    await db.invoice.update({ where: { id: invoiceId }, data: { acctError: message } }).catch(() => undefined);
    throw new AccountingError(message);
  }
}

/** Sends a payment recorded in Kudu (the invoice must already be in the package). */
export async function sendPayment(db: Db, paymentId: string): Promise<void> {
  let who = "the accounting package";
  try {
    const a = await requireActive(db);
    who = shortName(a.adapter.id);
    const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: { include: { customer: true } } } });
    if (p.fromAccounting || (p.acctId && p.acctLink === a.key)) return;
    const inv = p.invoice;
    if (inv.acctLink !== a.key || !inv.acctId || inv.customer.acctLink !== a.key || !inv.customer.acctId) {
      throw new AccountingError(`Send the invoice to ${who} first.`);
    }
    let id: string;
    try {
      id = await a.adapter.createPayment(
        a.ctx,
        { id: p.id, amount: p.amount, date: p.date, method: p.method, reference: p.reference, invoiceNumber: inv.number, customerName: inv.customer.name },
        { invoiceId: inv.acctId, customerId: inv.customer.acctId },
      );
    } catch (e) {
      // Some packages create the payment and then fail a second step: keep its ID so it isn't sent twice.
      const created = (e as { createdId?: string }).createdId;
      if (created) await db.payment.update({ where: { id: p.id }, data: { acctId: created, acctLink: a.key } });
      throw e;
    }
    await db.payment.update({ where: { id: p.id }, data: { acctId: id, acctLink: a.key, acctError: "" } });
  } catch (e) {
    const message = msg(e, who);
    await db.payment.update({ where: { id: paymentId }, data: { acctError: message } }).catch(() => undefined);
    throw new AccountingError(message);
  }
}

/** After a payment is deleted in Kudu: removes it from the package too, if it was sent there. */
export async function removePayment(db: Db, p: { acctId: string | null; acctLink: string; fromAccounting: boolean; invoiceId: string }): Promise<void> {
  if (!p.acctId || p.fromAccounting) return;
  const a = await activeLink(db);
  const who = shortName(p.acctLink);
  if (!a || a.key !== p.acctLink) {
    await db.invoice.update({ where: { id: p.invoiceId }, data: { acctError: `A payment was removed in Kudu. Remove it in ${who} by hand (ID ${p.acctId}).` } });
    return;
  }
  try {
    await a.adapter.deletePayment(await ctxFor(db, a.adapter.id), p.acctId);
  } catch (e) {
    await db.invoice.update({
      where: { id: p.invoiceId },
      data: { acctError: `A payment was removed in Kudu but not in ${who} (${(e as Error).message}). Remove ${who} payment ${p.acctId} by hand.`.slice(0, 500) },
    });
  }
}

/**
 * Called after an invoice or its payments change. With auto-send on, sends issued invoices that are
 * new or changed since they were sent, then any payments not yet sent. Never throws: problems are
 * kept on the invoice/payment and shown there.
 */
export async function autoSend(db: Db, invoiceId: string): Promise<void> {
  try {
    const a = await activeLink(db);
    if (!a || !a.settings.acctAutoSend) return;
    const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true, items: { orderBy: { sortOrder: "asc" } } } });
    if (!inv || inv.status === "DRAFT") return;
    const inBooks = inv.acctLink === a.key && !!inv.acctId;
    // Invoices from before the link was set up are assumed to be in the package already.
    if (!inBooks && a.settings.acctStartDate && inv.issueDate < a.settings.acctStartDate) return;
    if (inv.status === "CANCELLED") {
      if (inBooks) await sendInvoice(db, inv.id).catch(() => undefined); // records the credit-note reminder
      return;
    }
    if (!inBooks || inv.acctHash !== invoiceHash(inv)) await sendInvoice(db, inv.id);
    for (const p of inv.payments.filter((x) => !x.fromAccounting && !(x.acctId && x.acctLink === a.key))) await sendPayment(db, p.id).catch(() => undefined);
  } catch {
    // kept on the record
  }
}

/** Paid / part-paid / sent from the payments, as Kudu's invoice screen does. */
async function refreshPaid(db: Db, invoiceId: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  const amountPaid = inv.payments.reduce((t, p) => t + p.amount, 0);
  let status = inv.status;
  if (status !== "CANCELLED" && status !== "DRAFT") status = amountPaid >= inv.total && inv.total > 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : "SENT";
  await db.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status } });
}

/**
 * Asks the package what is still owed on open invoices sent to it. Where it shows more paid than
 * Kudu knows about (a payment captured there, e.g. from the bank feed), the difference is added in
 * Kudu as a payment "from <package>". Checks at most `limit` invoices per run (least recently
 * checked first) to stay inside the package's rate limit.
 */
export async function pullPayments(db: Db, opts: { invoiceIds?: string[]; limit?: number } = {}): Promise<{ checked: number; added: number; amount: number; who: string }> {
  const a = await requireActive(db);
  const who = shortName(a.adapter.id);
  const open = await db.invoice.findMany({
    where: { acctLink: a.key, acctId: { not: null }, status: { in: ["SENT", "PARTIALLY_PAID"] }, ...(opts.invoiceIds ? { id: { in: opts.invoiceIds } } : {}) },
    include: { payments: true },
    orderBy: [{ acctCheckedAt: { sort: "asc", nulls: "first" } }],
    take: opts.limit ?? a.adapter.pullPerRun,
  });
  let added = 0;
  let amount = 0;
  for (const inv of open) {
    const r = await a.adapter.getInvoice(a.ctx, inv.acctId!);
    const now = new Date();
    if (r) {
      const paidThere = r.total - r.due;
      const paidInKudu = inv.payments.reduce((t, p) => t + p.amount, 0);
      const missing = Math.min(paidThere, inv.total) - paidInKudu;
      if (missing > 1) {
        await db.payment.create({
          data: { invoiceId: inv.id, amount: missing, date: now, method: who, reference: `Captured in ${who}`, fromAccounting: true, acctLink: a.key },
        });
        added++;
        amount += missing;
        await refreshPaid(db, inv.id);
      }
    }
    await db.invoice.update({ where: { id: inv.id }, data: { acctCheckedAt: now } });
  }
  await db.settings.update({ where: { id: 1 }, data: { acctLastSyncAt: new Date(), acctLastError: "" } });
  return { checked: open.length, added, amount, who };
}
