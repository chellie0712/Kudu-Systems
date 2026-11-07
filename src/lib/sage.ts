import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret } from "@/lib/secret";
import { dayKey } from "@/lib/format";

// Sage Business Cloud Accounting, South African edition (formerly Sage One). It has its own API,
// separate from Sage's UK/US "v3.1" API: https://accounting.sageone.co.za/api/2.0.0/help
//  - every call carries Kudu's API key (?apikey=), issued by Sage to the integrator, once for the platform
//  - and HTTP Basic auth with a Sage user's username and password, per company
//  - company data needs ?companyid=
//  - limits: 100 requests a minute, 5,000 a day per company; HTTP 429 blocks the IP for an hour
// Sage has no draft invoices: a saved tax invoice is final, so Kudu only sends issued invoices.

const API_URL = () => (process.env.SAGE_API_URL || "https://accounting.sageone.co.za/api/2.0.0").replace(/\/$/, "");
export const sageConfigured = () => Boolean(process.env.SAGE_API_KEY);

export class SageError extends Error {}

export type SageLogin = { username: string; password: string; companyId?: number | null };

type Paged<T> = { TotalResults?: number; ReturnedResults?: number; Results?: T[] };

function messageOf(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 300);
  const b = body as { Message?: string; message?: string; ExceptionMessage?: string; ModelState?: Record<string, string[]> } | null;
  const model = b?.ModelState ? Object.values(b.ModelState).flat().join(" ") : "";
  return (model || b?.ExceptionMessage || b?.Message || b?.message || `HTTP ${status}`).slice(0, 300);
}

/** One call to Sage. `path` is like "Customer/Save". */
export async function sageCall<T>(
  login: SageLogin,
  path: string,
  opts: { method?: "GET" | "POST" | "DELETE"; body?: unknown; query?: Record<string, string | number | boolean>; company?: boolean } = {},
): Promise<T> {
  if (!sageConfigured()) throw new SageError("Sage is not set up on this server (SAGE_API_KEY is missing).");
  const url = new URL(`${API_URL()}/${path}`);
  url.searchParams.set("apikey", process.env.SAGE_API_KEY!);
  if (opts.company !== false) {
    if (!login.companyId) throw new SageError("Choose your Sage company in Settings → Sage.");
    url.searchParams.set("companyid", String(login.companyId));
  }
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Basic ${Buffer.from(`${login.username}:${login.password}`).toString("base64")}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new SageError(`Could not reach Sage (${e instanceof Error ? e.message : e}).`);
  }
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // plain-text error
  }
  if (res.status === 401) throw new SageError("Sage refused the username or password. Check them in Settings → Sage.");
  if (res.status === 429) throw new SageError("Sage's request limit was reached (100 a minute or 5,000 a day). Try again later.");
  if (!res.ok) throw new SageError(`Sage: ${messageOf(body, res.status)}`);
  return body as T;
}

const results = <T>(r: Paged<T> | T[]): T[] => (Array.isArray(r) ? r : (r.Results ?? []));

/** Loads every page of a list (Sage returns at most 100 at a time). */
async function listAll<T>(login: SageLogin, path: string, company = true): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0; skip < 2000; skip += 100) {
    const r = await sageCall<Paged<T> | T[]>(login, path, { company, query: { $top: 100, $skip: skip } });
    const page = results(r);
    out.push(...page);
    if (page.length < 100 || Array.isArray(r)) break;
  }
  return out;
}

export type Option = { id: number; name: string; extra?: string };

export async function sageCompanies(login: SageLogin): Promise<Option[]> {
  const rows = await listAll<{ ID: number; Name: string; Active?: boolean }>(login, "Company/Get", false);
  return rows.filter((c) => c.Active !== false).map((c) => ({ id: c.ID, name: c.Name }));
}

export async function sageTaxTypes(login: SageLogin): Promise<(Option & { percentage: number; isDefault: boolean })[]> {
  const rows = await listAll<{ ID: number; Name: string; Percentage: number; IsDefault?: boolean; Active?: boolean }>(login, "TaxType/Get");
  return rows.filter((t) => t.Active !== false).map((t) => ({ id: t.ID, name: t.Name, percentage: Number(t.Percentage), isDefault: !!t.IsDefault }));
}

export async function sageItems(login: SageLogin): Promise<Option[]> {
  const rows = await listAll<{ ID: number; Code?: string; Description?: string; Active?: boolean }>(login, "Item/Get");
  return rows.filter((i) => i.Active !== false).map((i) => ({ id: i.ID, name: [i.Code, i.Description].filter(Boolean).join(" · ") || `Item ${i.ID}` }));
}

export async function sageBankAccounts(login: SageLogin): Promise<Option[]> {
  const rows = await listAll<{ ID: number; Name?: string; BankName?: string; Active?: boolean }>(login, "BankAccount/Get");
  return rows.filter((b) => b.Active !== false).map((b) => ({ id: b.ID, name: [b.Name, b.BankName].filter(Boolean).join(" · ") || `Account ${b.ID}` }));
}

// ---------- Sending Kudu records ----------

type Db = Pick<PrismaClient, "settings" | "customer" | "invoice" | "payment">;

/** The company's Sage login from Settings, or an error saying what is missing. */
export async function sageLogin(db: Db): Promise<SageLogin & { settings: Awaited<ReturnType<Db["settings"]["findUniqueOrThrow"]>> }> {
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  if (!settings.sageUsername || !settings.sagePassword) throw new SageError("Sage is not connected. Add the Sage login in Settings → Sage.");
  return { username: settings.sageUsername, password: decryptSecret(settings.sagePassword), companyId: settings.sageCompanyId, settings };
}

export const sageReady = (s: { sageUsername: string; sagePassword: string | null; sageCompanyId: number | null }) =>
  sageConfigured() && !!s.sageUsername && !!s.sagePassword && !!s.sageCompanyId;

/** Sage takes up to five 100-character address lines. */
function addressLines(prefix: "PostalAddress" | "DeliveryAddress", text: string) {
  const lines = text.split(/\r?\n|,\s*/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 5) lines.splice(4, lines.length - 4, lines.slice(4).join(", "));
  return Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`${prefix}0${n}`, (lines[n - 1] ?? "").slice(0, 100)]));
}

const day = (d: Date) => dayKey(d);

type InvoiceForHash = {
  customerId: string; issueDate: Date; dueDate: Date; reference: string; notes: string; vatRate: number; discount: number; total: number;
  items: { description: string; quantity: number; unit: string; unitPrice: number }[];
};
/** Changes only when something Sage shows changes (not payments or status). */
export function sageHash(inv: InvoiceForHash): string {
  const parts = [inv.customerId, day(inv.issueDate), day(inv.dueDate), inv.reference, inv.notes, inv.vatRate, inv.discount, inv.total,
    ...inv.items.map((i) => [i.description, i.quantity, i.unit, i.unitPrice].join("|"))];
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

async function sendCustomer(db: Db, login: SageLogin, customerId: string): Promise<number> {
  const c = await db.customer.findUniqueOrThrow({ where: { id: customerId } });
  const saved = await sageCall<{ ID: number }>(login, "Customer/Save", {
    method: "POST",
    body: {
      ID: c.sageId ?? 0,
      Name: c.name.slice(0, 100),
      ContactName: c.contactPerson.slice(0, 100),
      Email: c.email.slice(0, 100),
      Telephone: c.phone.slice(0, 30),
      Mobile: c.altPhone.slice(0, 30),
      TaxReference: c.vatNumber.slice(0, 30),
      Active: true,
      // Kudu allocates each receipt to its own invoice (see sendPaymentToSage).
      AutoAllocateToOldestInvoice: false,
      ...addressLines("PostalAddress", c.billingAddress),
      ...addressLines("DeliveryAddress", c.siteAddress || c.billingAddress),
    },
  });
  if (!saved?.ID) throw new SageError("Sage did not return the customer's ID.");
  if (saved.ID !== c.sageId) await db.customer.update({ where: { id: c.id }, data: { sageId: saved.ID } });
  return saved.ID;
}

/** Sends (or re-sends) one issued invoice as a Sage tax invoice. Throws SageError; the error is also kept on the invoice. */
export async function sendInvoiceToSage(db: Db, invoiceId: string): Promise<{ sageNumber: string }> {
  try {
    const login = await sageLogin(db);
    const s = login.settings;
    const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { items: { orderBy: { sortOrder: "asc" } } } });
    if (inv.status === "DRAFT") throw new SageError("Drafts are not sent to Sage. Mark the invoice as sent first.");
    if (inv.status === "CANCELLED") {
      throw new SageError(inv.sageId ? "Cancelled in Kudu. Sage does not delete tax invoices: issue a credit note in Sage." : "Cancelled invoices are not sent to Sage.");
    }
    const taxTypeId = inv.vatRate > 0 ? s.sageTaxTypeId : (s.sageZeroTaxTypeId ?? s.sageTaxTypeId);
    if (!taxTypeId) throw new SageError("Choose the Sage VAT type in Settings → Sage.");
    if (!s.sageItemId) throw new SageError("Choose the Sage item to post sales to in Settings → Sage.");
    const customerId = await sendCustomer(db, login, inv.customerId);
    const discountPct = inv.subtotal > 0 && inv.discount > 0 ? Math.round((inv.discount / inv.subtotal) * 1000000) / 10000 : 0;
    const saved = await sageCall<{ ID: number; DocumentNumber?: string; Total?: number }>(login, "TaxInvoice/Save", {
      method: "POST",
      query: { useSystemDocumentNumber: !s.sageUseKuduNumbers },
      body: {
        ID: inv.sageId ?? 0,
        CustomerId: customerId,
        Date: day(inv.issueDate),
        DueDate: day(inv.dueDate),
        DocumentNumber: inv.number.slice(0, 100),
        Reference: (inv.reference || inv.number).slice(0, 100),
        ExternalReference: inv.number.slice(0, 100),
        Message: inv.notes.slice(0, 8000),
        Inclusive: false,
        DiscountPercentage: discountPct,
        Lines: inv.items.map((it) => ({
          SelectionId: s.sageItemId,
          LineType: 0, // 0 = item/service line
          TaxTypeId: taxTypeId,
          Description: it.description.slice(0, 100),
          Comments: it.description.length > 100 ? it.description : "",
          Quantity: it.quantity,
          Unit: it.unit,
          UnitPriceExclusive: it.unitPrice / 100,
        })),
      },
    });
    if (!saved?.ID) throw new SageError("Sage did not return the invoice's ID.");
    let warning = "";
    if (typeof saved.Total === "number" && Math.abs(Math.round(saved.Total * 100) - inv.total) > 1) {
      warning = `Sage's total (R ${saved.Total.toFixed(2)}) differs from Kudu's. Check the VAT type and discount in Sage.`;
    }
    await db.invoice.update({
      where: { id: inv.id },
      data: { sageId: saved.ID, sageNumber: saved.DocumentNumber ?? inv.number, sageSentAt: new Date(), sageError: warning, sageHash: sageHash(inv) },
    });
    return { sageNumber: saved.DocumentNumber ?? inv.number };
  } catch (e) {
    const message = e instanceof SageError ? e.message : `Sending to Sage failed: ${e instanceof Error ? e.message : String(e)}`;
    await db.invoice.update({ where: { id: invoiceId }, data: { sageError: message.slice(0, 500) } }).catch(() => undefined);
    throw new SageError(message);
  }
}

/** Sends a payment recorded in Kudu as a Sage customer receipt (the invoice must already be in Sage). */
export async function sendPaymentToSage(db: Db, paymentId: string): Promise<void> {
  try {
    const login = await sageLogin(db);
    const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { invoice: { include: { customer: true } } } });
    if (p.sageId || p.fromSage) return;
    if (!p.invoice.sageId || !p.invoice.customer.sageId) throw new SageError("Send the invoice to Sage first.");
    if (!login.settings.sageBankAccountId) throw new SageError("Choose the Sage bank account for payments in Settings → Sage.");
    const saved = await sageCall<{ ID: number }>(login, "CustomerReceipt/Save", {
      method: "POST",
      query: { useSystemDocumentNumber: true },
      body: {
        ID: 0,
        CustomerId: p.invoice.customer.sageId,
        Date: day(p.date),
        Total: p.amount / 100,
        BankAccountId: login.settings.sageBankAccountId,
        Reference: (p.reference || p.invoice.number).slice(0, 100),
        Description: `${p.method} for ${p.invoice.number}`.slice(0, 100),
        Payee: p.invoice.customer.name,
      },
    });
    if (!saved?.ID) throw new SageError("Sage did not return the receipt's ID.");
    await db.payment.update({ where: { id: p.id }, data: { sageId: saved.ID, sageError: "" } });
    // Settle this invoice with it, so Sage's balance per invoice matches Kudu's.
    try {
      await sageCall(login, "Allocation/Save", {
        method: "POST",
        body: { ID: 0, SourceDocumentId: saved.ID, AllocatedToDocumentId: p.invoice.sageId, Total: p.amount / 100 },
      });
    } catch (e) {
      throw new SageError(`Receipt ${saved.ID} is in Sage but not allocated to ${p.invoice.number}: ${(e as Error).message}. Allocate it in Sage.`);
    }
  } catch (e) {
    const message = e instanceof SageError ? e.message : `Sending to Sage failed: ${e instanceof Error ? e.message : String(e)}`;
    await db.payment.update({ where: { id: paymentId }, data: { sageError: message.slice(0, 500) } }).catch(() => undefined);
    throw new SageError(message);
  }
}

/** Removes a receipt from Sage when its payment is deleted in Kudu. */
export async function deleteSageReceipt(db: Db, sageId: number): Promise<void> {
  const login = await sageLogin(db);
  await sageCall(login, `CustomerReceipt/Delete/${sageId}`, { method: "DELETE" });
}

/**
 * Called after an invoice or its payments change. With auto-send on, sends issued invoices that are
 * new or changed since they were sent, then any payments not yet in Sage. Never throws: problems
 * are kept on the invoice/payment and shown there.
 */
export async function autoSendToSage(db: Db, invoiceId: string): Promise<void> {
  const s = await db.settings.findUnique({ where: { id: 1 } });
  if (!s || !s.sageAutoSend || !sageReady(s)) return;
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true, items: { orderBy: { sortOrder: "asc" } } } });
  if (!inv || inv.status === "DRAFT") return;
  // Invoices from before the link was set up are assumed to be in Sage already.
  if (!inv.sageId && s.sageStartDate && inv.issueDate < s.sageStartDate) return;
  try {
    if (inv.status === "CANCELLED") {
      if (inv.sageId) await sendInvoiceToSage(db, inv.id).catch(() => undefined); // records the credit-note reminder
      return;
    }
    if (!inv.sageId || inv.sageHash !== sageHash(inv)) await sendInvoiceToSage(db, inv.id);
    for (const p of inv.payments.filter((x) => !x.sageId)) await sendPaymentToSage(db, p.id).catch(() => undefined);
  } catch {
    // kept on the record
  }
}

// ---------- Payments captured in Sage -> Kudu ----------

/** Paid / part-paid / sent from the payments, as Kudu's invoice screen does. */
async function refreshPaid(db: Db, invoiceId: string) {
  const inv = await db.invoice.findUniqueOrThrow({ where: { id: invoiceId }, include: { payments: true } });
  const amountPaid = inv.payments.reduce((t, p) => t + p.amount, 0);
  let status = inv.status;
  if (status !== "CANCELLED" && status !== "DRAFT") status = amountPaid >= inv.total && inv.total > 0 ? "PAID" : amountPaid > 0 ? "PARTIALLY_PAID" : "SENT";
  await db.invoice.update({ where: { id: invoiceId }, data: { amountPaid, status } });
}

/**
 * Asks Sage what is still owed on open invoices that were sent to it. Where Sage shows more paid
 * than Kudu knows about (a receipt captured in Sage, e.g. from the bank feed), the difference is
 * added in Kudu as a payment "from Sage". Checks at most `limit` invoices per run, least recently
 * checked first, to stay inside Sage's 100-requests-a-minute limit.
 */
export async function pullPaymentsFromSage(db: Db, opts: { invoiceIds?: string[]; limit?: number } = {}): Promise<{ checked: number; added: number; amount: number }> {
  const login = await sageLogin(db);
  if (!login.companyId) throw new SageError("Choose your Sage company in Settings → Sage.");
  const open = await db.invoice.findMany({
    where: { sageId: { not: null }, status: { in: ["SENT", "PARTIALLY_PAID"] }, ...(opts.invoiceIds ? { id: { in: opts.invoiceIds } } : {}) },
    include: { payments: true },
    orderBy: [{ sageCheckedAt: { sort: "asc", nulls: "first" } }],
    take: opts.limit ?? 60,
  });
  let added = 0;
  let amount = 0;
  for (const inv of open) {
    const r = await sageCall<{ Total?: number; AmountDue?: number }>(login, `TaxInvoice/Get/${inv.sageId}`);
    const now = new Date();
    if (typeof r?.Total !== "number" || typeof r.AmountDue !== "number") {
      await db.invoice.update({ where: { id: inv.id }, data: { sageCheckedAt: now } });
      continue;
    }
    const paidInSage = Math.round(r.Total * 100) - Math.round(r.AmountDue * 100);
    const paidInKudu = inv.payments.reduce((t, p) => t + p.amount, 0);
    const missing = Math.min(paidInSage, inv.total) - paidInKudu;
    if (missing > 1) {
      await db.payment.create({
        data: { invoiceId: inv.id, amount: missing, date: now, method: "Sage", reference: "Captured in Sage", fromSage: true },
      });
      added++;
      amount += missing;
      await refreshPaid(db, inv.id);
    }
    await db.invoice.update({ where: { id: inv.id }, data: { sageCheckedAt: now } });
  }
  return { checked: open.length, added, amount };
}
