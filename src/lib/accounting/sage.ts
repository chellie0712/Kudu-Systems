import { addressLines, call, day, rands, toCents } from "./http";
import { AccountingError, type ApiAdapter, type Ctx, type Option } from "./types";

// Sage Business Cloud Accounting, South African edition (formerly Sage One). It has its own API,
// separate from Sage's UK/US "v3.1" API: https://accounting.sageone.co.za/api/2.0.0/help
//  - every call carries Kudu's API key (?apikey=), issued by Sage to the integrator, once for the platform
//  - and HTTP Basic auth with a Sage user's username and password, per company
//  - company data needs ?companyid=
//  - limits: 100 requests a minute, 5,000 a day per company; HTTP 429 blocks the IP for an hour
// Sage has no draft invoices: a saved tax invoice is final, so Kudu only sends issued invoices.

const API_URL = () => (process.env.SAGE_API_URL || "https://accounting.sageone.co.za/api/2.0.0").replace(/\/$/, "");
const WHO = "Sage";

type Login = { username: string; password: string };
type Paged<T> = { Results?: T[] } | T[];

function login(ctx: Ctx): Login {
  const c = ctx.link.credentials;
  const username = c.username || ctx.link.config.username || "";
  if (!username || !c.password) throw new AccountingError("Sage is not connected. Add the Sage login in Settings → Accounting.");
  return { username, password: c.password };
}

async function sage<T>(l: Login, path: string, opts: { method?: string; body?: unknown; query?: Record<string, string | number | boolean>; companyId?: string } = {}): Promise<T> {
  if (!process.env.SAGE_API_KEY) throw new AccountingError("Sage is not set up on this server (SAGE_API_KEY is missing).");
  const url = new URL(`${API_URL()}/${path}`);
  url.searchParams.set("apikey", process.env.SAGE_API_KEY);
  if (opts.companyId) url.searchParams.set("companyid", opts.companyId);
  for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
  return call<T>(WHO, url.toString(), {
    method: opts.method,
    body: opts.body,
    headers: { Authorization: `Basic ${Buffer.from(`${l.username}:${l.password}`).toString("base64")}` },
  });
}

const company = (ctx: Ctx) => {
  if (!ctx.link.orgId) throw new AccountingError("Choose your Sage company in Settings → Accounting.");
  return ctx.link.orgId;
};

/** Loads every page of a list (Sage returns at most 100 at a time). */
async function listAll<T>(l: Login, path: string, companyId?: string): Promise<T[]> {
  const out: T[] = [];
  for (let skip = 0; skip < 2000; skip += 100) {
    const r = await sage<Paged<T>>(l, path, { companyId, query: { $top: 100, $skip: skip } });
    const page = Array.isArray(r) ? r : (r.Results ?? []);
    out.push(...page);
    if (page.length < 100 || Array.isArray(r)) break;
  }
  return out;
}

const active = <T extends { Active?: boolean }>(rows: T[]) => rows.filter((r) => r.Active !== false);

function addr(prefix: "PostalAddress" | "DeliveryAddress", text: string) {
  const lines = addressLines(text, 5);
  return Object.fromEntries([1, 2, 3, 4, 5].map((n) => [`${prefix}0${n}`, (lines[n - 1] ?? "").slice(0, 100)]));
}

export const sageAdapter: ApiAdapter = {
  id: "sage",
  name: "Sage Business Cloud Accounting",
  blurb: "Sage's online accounting for South Africa (formerly Sage One). Not Pastel: for Pastel Partner/Evolution choose “Sage Pastel (file import)”.",
  kind: "api",
  needsOrg: true,
  auth: "login",
  envVars: [
    { name: "SAGE_API_KEY", required: true, help: "The API key Sage South Africa issues to Kudu as an integrator." },
    { name: "SAGE_API_URL", required: false, help: "Only for Sage's test system: https://resellers.accounting.sageone.co.za/api/2.0.0" },
  ],
  configured: () => Boolean(process.env.SAGE_API_KEY),
  pullPerRun: 90,
  notes: "Sage has no draft invoices, so an invoice goes to Sage when it is marked as sent. Cancelling in Kudu does not touch Sage: issue a credit note there.",
  loginFields: [
    { name: "username", label: "Sage username (email)", type: "email", help: "Best a separate Sage user just for Kudu, e.g. kudu@yourcompany.co.za" },
    { name: "password", label: "Sage password", type: "password", secret: true },
  ],

  async verifyLogin(c) {
    const rows = await listAll<{ ID: number; Name: string; Active?: boolean }>({ username: c.username, password: c.password }, "Company/Get");
    if (active(rows).length === 0) throw new AccountingError("That Sage user signed in, but can't see any companies.");
  },

  async organisations(ctx) {
    const rows = await listAll<{ ID: number; Name: string; Active?: boolean }>(login(ctx), "Company/Get");
    return active(rows).map((c) => ({ id: String(c.ID), name: c.Name }));
  },

  async pickers(ctx, vatRate) {
    const l = login(ctx);
    const cid = company(ctx);
    const [taxes, items, banks] = await Promise.all([
      listAll<{ ID: number; Name: string; Percentage: number; IsDefault?: boolean; Active?: boolean }>(l, "TaxType/Get", cid),
      listAll<{ ID: number; Code?: string; Description?: string; Active?: boolean }>(l, "Item/Get", cid),
      listAll<{ ID: number; Name?: string; BankName?: string; Active?: boolean }>(l, "BankAccount/Get", cid),
    ]);
    const tax = active(taxes).map((t) => ({ id: String(t.ID), name: `${t.Name} (${t.Percentage}%)`, rate: Number(t.Percentage), def: !!t.IsDefault }));
    const opt = (rows: { id: string; name: string }[]): Option[] => rows.map(({ id, name }) => ({ id, name }));
    return [
      { key: "taxType", label: `VAT type for ${vatRate}% lines`, required: true, options: opt(tax), suggested: (tax.find((t) => t.rate === vatRate && t.def) ?? tax.find((t) => t.rate === vatRate))?.id },
      { key: "zeroTaxType", label: "VAT type for 0% invoices", options: opt(tax), suggested: tax.find((t) => t.rate === 0)?.id, help: "Blank = same as above" },
      {
        key: "item",
        label: "Post invoice lines as this Sage item / service",
        required: true,
        options: active(items).map((i) => ({ id: String(i.ID), name: [i.Code, i.Description].filter(Boolean).join(" · ") || `Item ${i.ID}` })),
        help: "Each line keeps its own description and price; the item only decides which sales account Sage posts it to.",
      },
      { key: "bankAccount", label: "Bank account for payments", required: true, options: active(banks).map((b) => ({ id: String(b.ID), name: [b.Name, b.BankName].filter(Boolean).join(" · ") || `Account ${b.ID}` })) },
    ];
  },

  async upsertCustomer(ctx, c, existingId) {
    const saved = await sage<{ ID: number }>(login(ctx), "Customer/Save", {
      method: "POST",
      companyId: company(ctx),
      body: {
        ID: existingId ? Number(existingId) : 0,
        Name: c.name.slice(0, 100),
        ContactName: c.contactPerson.slice(0, 100),
        Email: c.email.slice(0, 100),
        Telephone: c.phone.slice(0, 30),
        Mobile: c.altPhone.slice(0, 30),
        TaxReference: c.vatNumber.slice(0, 30),
        Active: true,
        // Kudu allocates each receipt to its own invoice (see createPayment).
        AutoAllocateToOldestInvoice: false,
        ...addr("PostalAddress", c.billingAddress),
        ...addr("DeliveryAddress", c.siteAddress || c.billingAddress),
      },
    });
    if (!saved?.ID) throw new AccountingError("Sage did not return the customer's ID.");
    return String(saved.ID);
  },

  async upsertInvoice(ctx, inv, customerId, existingId, { useKuduNumber }) {
    const cfg = ctx.link.config;
    const taxTypeId = inv.vatRate > 0 ? cfg.taxType : cfg.zeroTaxType || cfg.taxType;
    if (!taxTypeId) throw new AccountingError("Choose the Sage VAT type in Settings → Accounting.");
    if (!cfg.item) throw new AccountingError("Choose the Sage item to post sales to in Settings → Accounting.");
    const saved = await sage<{ ID: number; DocumentNumber?: string; Total?: number }>(login(ctx), "TaxInvoice/Save", {
      method: "POST",
      companyId: company(ctx),
      query: { useSystemDocumentNumber: !useKuduNumber },
      body: {
        ID: existingId ? Number(existingId) : 0,
        CustomerId: Number(customerId),
        Date: day(inv.issueDate),
        DueDate: day(inv.dueDate),
        DocumentNumber: inv.number.slice(0, 100),
        Reference: (inv.reference || inv.number).slice(0, 100),
        ExternalReference: inv.number.slice(0, 100),
        Message: inv.notes.slice(0, 8000),
        Inclusive: false,
        DiscountPercentage: inv.discountPct,
        Lines: inv.items.map((it) => ({
          SelectionId: Number(cfg.item),
          LineType: 0, // 0 = item/service line
          TaxTypeId: Number(taxTypeId),
          Description: it.description.slice(0, 100),
          Comments: it.description.length > 100 ? it.description : "",
          Quantity: it.quantity,
          Unit: it.unit,
          UnitPriceExclusive: rands(it.unitPrice),
        })),
      },
    });
    if (!saved?.ID) throw new AccountingError("Sage did not return the invoice's ID.");
    return { id: String(saved.ID), number: saved.DocumentNumber ?? inv.number, total: typeof saved.Total === "number" ? toCents(saved.Total) : undefined };
  },

  async createPayment(ctx, p, ext) {
    const bank = ctx.link.config.bankAccount;
    if (!bank) throw new AccountingError("Choose the Sage bank account for payments in Settings → Accounting.");
    const l = login(ctx);
    const cid = company(ctx);
    const saved = await sage<{ ID: number }>(l, "CustomerReceipt/Save", {
      method: "POST",
      companyId: cid,
      query: { useSystemDocumentNumber: true },
      body: {
        ID: 0,
        CustomerId: Number(ext.customerId),
        Date: day(p.date),
        Total: rands(p.amount),
        BankAccountId: Number(bank),
        Reference: (p.reference || p.invoiceNumber).slice(0, 100),
        Description: `${p.method} for ${p.invoiceNumber}`.slice(0, 100),
        Payee: p.customerName,
      },
    });
    if (!saved?.ID) throw new AccountingError("Sage did not return the receipt's ID.");
    // Settle this invoice with it, so Sage's balance per invoice matches Kudu's.
    try {
      await sage(l, "Allocation/Save", {
        method: "POST",
        companyId: cid,
        body: { ID: 0, SourceDocumentId: saved.ID, AllocatedToDocumentId: Number(ext.invoiceId), Total: rands(p.amount) },
      });
    } catch (e) {
      // The receipt exists: keep its ID (returned below via the error text) so it isn't sent twice.
      throw Object.assign(new AccountingError(`Receipt ${saved.ID} is in Sage but not allocated to ${p.invoiceNumber}: ${(e as Error).message}. Allocate it in Sage.`), {
        createdId: String(saved.ID),
      });
    }
    return String(saved.ID);
  },

  async deletePayment(ctx, id) {
    await sage(login(ctx), `CustomerReceipt/Delete/${id}`, { method: "DELETE", companyId: company(ctx) });
  },

  async getInvoice(ctx, id) {
    const r = await sage<{ Total?: number; AmountDue?: number }>(login(ctx), `TaxInvoice/Get/${id}`, { companyId: company(ctx) });
    if (typeof r?.Total !== "number" || typeof r.AmountDue !== "number") return null;
    return { total: toCents(r.Total), due: toCents(r.AmountDue) };
  },
};
