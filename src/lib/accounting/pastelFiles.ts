import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { invoiceHash } from "./sync";
import { loadLink } from "./store";
import { AccountingError } from "./types";

// Files for Sage Pastel Partner and Sage 200 Evolution (see pastel.ts).
//
// "partner" files use Pastel Partner's batch import layout (no header row, 18 fields):
//   Period, Date, GDC, Account, Reference, Description, Amount, Tax type, Tax amount,
//   Open item type, Cost code, Contra account, Exchange rate, Bank exchange rate, Batch ID,
//   Discount tax type, Discount amount, Home amount
// "evolution" files are plain CSV with a header row, for Evolution's import wizard, where the
// columns are mapped once and the mapping saved.
// Amounts are VAT-inclusive with the VAT amount beside them, as Pastel batches expect.

export const PASTEL_KEY = "pastel:";
type Db = Pick<PrismaClient, "settings" | "customer" | "invoice" | "payment" | "accountingLink">;
export type Format = "partner" | "evolution";

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
const amt = (cents: number) => (cents / 100).toFixed(2);

function ddmmyyyy(d: Date) {
  const tz = process.env.APP_TIMEZONE || "Africa/Johannesburg";
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  return p; // dd/mm/yyyy
}

/** Pastel period 1-12 counted from the first month of the financial year. */
function period(d: Date, yearStartMonth: number) {
  const tz = process.env.APP_TIMEZONE || "Africa/Johannesburg";
  const month = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "numeric" }).format(d));
  const start = yearStartMonth >= 1 && yearStartMonth <= 12 ? yearStartMonth : 3;
  return ((month - start + 12) % 12) + 1;
}

async function config(db: Db) {
  const link = await loadLink(db, "pastel");
  const c = link?.config ?? {};
  if (!c.salesAccount || !c.bankAccount || !c.taxType) throw new AccountingError("Fill in the Pastel accounts and tax types in Settings → Accounting first.");
  return { sales: c.salesAccount, bank: c.bankAccount, tax: c.taxType, zeroTax: c.zeroTaxType || "0", yearStart: Number(c.yearStartMonth || 3) };
}

/** Pastel Partner customer codes are up to 7 characters: 4 letters of the name + a number. */
async function ensureCodes(db: Db, customerIds: string[]): Promise<Map<string, string>> {
  const customers = await db.customer.findMany({ where: { id: { in: customerIds } } });
  const taken = new Set((await db.customer.findMany({ where: { acctLink: PASTEL_KEY, acctId: { not: null } }, select: { acctId: true } })).map((c) => c.acctId!));
  const out = new Map<string, string>();
  for (const c of customers) {
    if (c.acctLink === PASTEL_KEY && c.acctId) {
      out.set(c.id, c.acctId);
      continue;
    }
    const stem = (c.name.toUpperCase().replace(/[^A-Z0-9]/g, "") + "XXXX").slice(0, 4);
    let n = 1;
    while (taken.has(`${stem}${String(n).padStart(3, "0")}`)) n++;
    const code = `${stem}${String(n).padStart(3, "0")}`;
    taken.add(code);
    await db.customer.update({ where: { id: c.id }, data: { acctId: code, acctLink: PASTEL_KEY } });
    out.set(c.id, code);
  }
  return out;
}

/** Issued invoices not yet exported (or all from the start date). */
async function pendingInvoices(db: Db, all: boolean) {
  const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  return db.invoice.findMany({
    where: {
      status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] },
      ...(s.acctStartDate ? { issueDate: { gte: s.acctStartDate } } : {}),
      ...(all ? {} : { NOT: { acctLink: PASTEL_KEY } }),
    },
    include: { customer: true, items: { orderBy: { sortOrder: "asc" } } },
    orderBy: { issueDate: "asc" },
  });
}

export async function exportCustomers(db: Db, opts: { all: boolean; format: Format }): Promise<{ csv: string; count: number }> {
  const ids = opts.all
    ? (await db.customer.findMany({ where: { archived: false, invoices: { some: { status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] } } } }, select: { id: true } })).map((c) => c.id)
    : [...new Set((await pendingInvoices(db, false)).map((i) => i.customerId))];
  const codes = await ensureCodes(db, ids);
  const customers = await db.customer.findMany({ where: { id: { in: ids } }, orderBy: { name: "asc" } });
  const lines = (t: string) => {
    const l = t.split(/\r?\n|,\s*/).map((x) => x.trim()).filter(Boolean);
    return [0, 1, 2, 3].map((i) => (l[i] ?? "").slice(0, 30));
  };
  const header = ["Account", "Name", "Contact", "Telephone", "Cell", "Email", "VAT number", "Postal 1", "Postal 2", "Postal 3", "Postal code", "Delivery 1", "Delivery 2", "Delivery 3", "Delivery code"];
  const rows = customers.map((c) => [
    codes.get(c.id) ?? "",
    c.name.slice(0, 40),
    c.contactPerson.slice(0, 30),
    c.phone.slice(0, 16),
    c.altPhone.slice(0, 16),
    c.email.slice(0, 60),
    c.vatNumber.slice(0, 20),
    ...lines(c.billingAddress),
    ...lines(c.siteAddress || c.billingAddress),
  ]);
  return { csv: toCsv([header, ...rows]), count: rows.length };
}

export async function exportInvoices(db: Db, opts: { all: boolean; format: Format }): Promise<{ csv: string; count: number }> {
  const cfg = await config(db);
  const invoices = await pendingInvoices(db, opts.all);
  const codes = await ensureCodes(db, [...new Set(invoices.map((i) => i.customerId))]);
  const rows: (string | number)[][] = [];
  if (opts.format === "evolution") {
    rows.push(["Date", "Period", "Account", "Reference", "Description", "Amount incl VAT", "Tax type", "VAT amount", "Amount excl VAT", "Sales account", "Due date", "Kudu reference"]);
  }
  for (const inv of invoices) {
    const code = codes.get(inv.customerId) ?? "";
    const tax = inv.vatRate > 0 ? cfg.tax : cfg.zeroTax;
    const desc = (inv.items[0]?.description || `Invoice ${inv.number}`).slice(0, 40);
    if (opts.format === "evolution") {
      rows.push([ddmmyyyy(inv.issueDate), period(inv.issueDate, cfg.yearStart), code, inv.number, desc, amt(inv.total), tax, amt(inv.vatAmount), amt(inv.total - inv.vatAmount), cfg.sales, ddmmyyyy(inv.dueDate), inv.reference]);
    } else {
      rows.push([period(inv.issueDate, cfg.yearStart), ddmmyyyy(inv.issueDate), "D", code, inv.number.slice(0, 8), desc, amt(inv.total), tax, amt(inv.vatAmount), "", "", cfg.sales, 1, 1, "", "", 0, amt(inv.total)]);
    }
  }
  const now = new Date();
  for (const inv of invoices) {
    await db.invoice.update({ where: { id: inv.id }, data: { acctLink: PASTEL_KEY, acctId: inv.number, acctNumber: inv.number.slice(0, 8), acctSentAt: now, acctHash: invoiceHash(inv), acctError: "" } });
  }
  return { csv: toCsv(rows), count: invoices.length };
}

export async function exportReceipts(db: Db, opts: { all: boolean; format: Format; positive: boolean }): Promise<{ csv: string; count: number }> {
  const cfg = await config(db);
  const payments = await db.payment.findMany({
    where: { fromAccounting: false, invoice: { acctLink: PASTEL_KEY }, ...(opts.all ? {} : { NOT: { acctLink: PASTEL_KEY } }) },
    include: { invoice: { include: { customer: true } } },
    orderBy: { date: "asc" },
  });
  const sign = opts.positive ? 1 : -1;
  const rows: (string | number)[][] = [];
  if (opts.format === "evolution") rows.push(["Date", "Period", "Account", "Reference", "Description", "Amount", "Bank account", "Invoice", "Method"]);
  for (const p of payments) {
    const code = p.invoice.customer.acctLink === PASTEL_KEY ? (p.invoice.customer.acctId ?? "") : "";
    const desc = `${p.method} ${p.invoice.number}`.slice(0, 40);
    const ref = (p.reference || p.invoice.number).slice(0, 8);
    if (opts.format === "evolution") {
      rows.push([ddmmyyyy(p.date), period(p.date, cfg.yearStart), code, ref, desc, amt(p.amount), cfg.bank, p.invoice.number, p.method]);
    } else {
      rows.push([period(p.date, cfg.yearStart), ddmmyyyy(p.date), "D", code, ref, desc, amt(sign * p.amount), "0", "0.00", "", "", cfg.bank, 1, 1, "", "", 0, amt(sign * p.amount)]);
    }
  }
  for (const p of payments) await db.payment.update({ where: { id: p.id }, data: { acctLink: PASTEL_KEY, acctId: `kudu-${p.id}` } });
  return { csv: toCsv(rows), count: payments.length };
}

/** Minimal CSV reader (quotes, commas, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === "," || ch === ";" || ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function parseDate(s: string): Date | null {
  const t = s.trim();
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // dd/mm/yyyy
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T10:00:00+02:00`);
  m = t.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/); // yyyy-mm-dd
  if (m) return new Date(`${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}T10:00:00+02:00`);
  return null;
}

const toCentsLoose = (s: string) => {
  const n = Number(s.replace(/[R\s]/g, "").replace(/,(?=\d{2}$)/, ".").replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

/**
 * Reads receipts exported from Pastel/Evolution and adds them to the matching Kudu invoices as
 * payments "from Pastel". Columns are found by header (date, reference/invoice, amount); a file
 * without a header is read as Pastel Partner's batch layout. Each row is added only once.
 */
export async function importReceipts(db: Db, text: string): Promise<{ rows: number; added: number; amount: number; skipped: string[] }> {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (rows.length === 0) throw new AccountingError("The file is empty.");
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = head.some((h) => /date|amount|reference|invoice/.test(h));
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const col = hasHeader
    ? { date: find(/date/), ref: [find(/^invoice/), find(/invoice/), find(/reference|^ref/), find(/document/)].find((i) => i >= 0) ?? -1, amount: find(/amount|total|receipt/) }
    : { date: 1, ref: 4, amount: 6 };
  if (col.ref < 0 || col.amount < 0) throw new AccountingError("Couldn't find the invoice/reference and amount columns. The first row should name them (Date, Reference, Amount).");
  const data = hasHeader ? rows.slice(1) : rows;
  const invoices = await db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] } }, include: { payments: true } });
  const byNumber = new Map<string, (typeof invoices)[number]>();
  for (const inv of invoices) {
    byNumber.set(inv.number.toUpperCase(), inv);
    if (inv.acctNumber) byNumber.set(inv.acctNumber.toUpperCase(), inv);
  }
  let added = 0;
  let amount = 0;
  const skipped: string[] = [];
  for (const r of data) {
    const ref = (r[col.ref] ?? "").trim();
    const cents = Math.abs(toCentsLoose(r[col.amount] ?? ""));
    const date = (col.date >= 0 && parseDate(r[col.date] ?? "")) || new Date();
    if (!ref || !cents) continue;
    const inv = byNumber.get(ref.toUpperCase());
    if (!inv) {
      skipped.push(`${ref}: no Kudu invoice with that number`);
      continue;
    }
    const key = `pastel-${createHash("sha256").update([ref.toUpperCase(), cents, date.toISOString().slice(0, 10)].join("|")).digest("hex").slice(0, 24)}`;
    if (inv.payments.some((p) => p.acctId === key)) continue; // imported before
    const paid = inv.payments.reduce((t, p) => t + p.amount, 0);
    const take = Math.min(cents, inv.total - paid);
    if (take <= 0) {
      skipped.push(`${ref}: already fully paid in Kudu`);
      continue;
    }
    const p = await db.payment.create({ data: { invoiceId: inv.id, amount: take, date, method: "Pastel", reference: "Imported from Pastel", fromAccounting: true, acctLink: PASTEL_KEY, acctId: key } });
    inv.payments.push(p);
    const total = paid + take;
    await db.invoice.update({ where: { id: inv.id }, data: { amountPaid: total, status: total >= inv.total ? "PAID" : "PARTIALLY_PAID" } });
    added++;
    amount += take;
  }
  await db.settings.update({ where: { id: 1 }, data: { acctLastSyncAt: new Date() } });
  return { rows: data.length, added, amount, skipped };
}
