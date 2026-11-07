import { accessToken, addressLines, basic, call, day, rands, splitName, toCents, tokenFields } from "./http";
import { AccountingError, type ApiAdapter, type Ctx } from "./types";

// QuickBooks Online Accounting API (OAuth 2.0, one Intuit app for the platform; each company
// connects its own QuickBooks company, the "realm"). https://developer.intuit.com/app/developer/qbo/docs/api/accounting
// Limits: 500 requests a minute per company. Access tokens last 1 hour; the refresh token is
// replaced from time to time and lasts at most 5 years (Intuit asks users to reconnect then).
// Non-US companies (South Africa) must give a tax code on every line.

const WHO = "QuickBooks";
const id = () => process.env.QUICKBOOKS_CLIENT_ID || "";
const secret = () => process.env.QUICKBOOKS_CLIENT_SECRET || "";
const API = () =>
  process.env.QUICKBOOKS_ENVIRONMENT === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
const MINOR = "75";

async function tokens(form: Record<string, string>) {
  return call<{ access_token: string; refresh_token?: string; expires_in?: number }>(WHO, "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    headers: { Authorization: basic(id(), secret()) },
    form,
  });
}

async function qbo<T>(ctx: Ctx, path: string, opts: { method?: string; body?: unknown; query?: Record<string, string> } = {}): Promise<T> {
  if (!ctx.link.orgId) throw new AccountingError("QuickBooks is not connected. Connect it in Settings → Accounting.");
  const token = await accessToken(ctx, WHO, (refresh_token) => tokens({ grant_type: "refresh_token", refresh_token }));
  const u = new URL(`${API()}/v3/company/${ctx.link.orgId}/${path}`);
  u.searchParams.set("minorversion", MINOR);
  for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v);
  return call<T>(WHO, u.toString(), { method: opts.method, body: opts.body, headers: { Authorization: `Bearer ${token}` } });
}

async function query<T>(ctx: Ctx, entity: string, sql: string): Promise<T[]> {
  const r = await qbo<{ QueryResponse: Record<string, T[]> }>(ctx, "query", { query: { query: sql } });
  return r.QueryResponse?.[entity] ?? [];
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function address(text: string) {
  return Object.fromEntries(addressLines(text, 5).map((l, i) => [`Line${i + 1}`, l.slice(0, 500)]));
}

export const quickbooksAdapter: ApiAdapter = {
  id: "quickbooks",
  name: "QuickBooks Online",
  blurb: "Intuit QuickBooks Online. Connect signs you in to Intuit and asks which QuickBooks company Kudu may use.",
  kind: "api",
  needsOrg: true,
  auth: "oauth",
  envVars: [
    { name: "QUICKBOOKS_CLIENT_ID", required: true, help: "Client ID of Kudu's Intuit app (developer.intuit.com → Keys & credentials)." },
    { name: "QUICKBOOKS_CLIENT_SECRET", required: true, help: "Client Secret of the same app." },
    { name: "QUICKBOOKS_ENVIRONMENT", required: false, help: "sandbox while testing with Development keys; leave unset (production) for real companies." },
  ],
  configured: () => Boolean(id() && secret()),
  pullPerRun: 200,
  notes: "Kudu's invoice numbers are only used in QuickBooks if “Custom transaction numbers” is on in QuickBooks (Account and settings → Sales).",

  authorizeUrl(state, redirectUri) {
    const u = new URL("https://appcenter.intuit.com/connect/oauth2");
    u.search = new URLSearchParams({ client_id: id(), response_type: "code", scope: "com.intuit.quickbooks.accounting", redirect_uri: redirectUri, state }).toString();
    return u.toString();
  },

  async exchangeCode(params, redirectUri) {
    const realm = params.get("realmId");
    if (!realm) throw new AccountingError("QuickBooks did not say which company was chosen. Please try again.");
    const t = await tokens({ grant_type: "authorization_code", code: params.get("code") ?? "", redirect_uri: redirectUri });
    const credentials = tokenFields(t);
    let orgName = "";
    try {
      const info = await call<{ CompanyInfo?: { CompanyName?: string } }>(WHO, `${API()}/v3/company/${realm}/companyinfo/${realm}?minorversion=${MINOR}`, {
        headers: { Authorization: `Bearer ${t.access_token}` },
      });
      orgName = info.CompanyInfo?.CompanyName ?? "";
    } catch {
      // the name is only for display
    }
    return { credentials, orgId: realm, orgName: orgName || `Company ${realm}` };
  },

  organisations: async () => null,

  async pickers(ctx, vatRate) {
    const [codes, items, accounts] = await Promise.all([
      query<{ Id: string; Name: string; Description?: string }>(ctx, "TaxCode", "select * from TaxCode where Active = true maxresults 1000"),
      query<{ Id: string; Name: string; Type: string }>(ctx, "Item", "select * from Item where Active = true and Type in ('Service', 'NonInventory') maxresults 1000"),
      query<{ Id: string; Name: string; AccountType: string }>(ctx, "Account", "select * from Account where Active = true and AccountType in ('Bank', 'Other Current Asset') maxresults 1000"),
    ]);
    const tax = codes.map((c) => ({ id: c.Id, name: c.Description && c.Description !== c.Name ? `${c.Name} · ${c.Description}` : c.Name }));
    const find = (re: RegExp) => tax.find((t) => re.test(t.name))?.id;
    return [
      { key: "taxType", label: `Tax code for ${vatRate}% lines`, required: true, options: tax, suggested: find(new RegExp(`(^|\\D)${vatRate}(\\D|$)`)) ?? find(/standard/i) },
      { key: "zeroTaxType", label: "Tax code for 0% invoices", options: tax, suggested: find(/zero|0%/i), help: "Blank = same as above" },
      {
        key: "item",
        label: "Post invoice lines as this QuickBooks product/service",
        required: true,
        options: items.map((i) => ({ id: i.Id, name: i.Name })),
        help: "Each line keeps its own description and price; the product/service only decides the income account.",
      },
      {
        key: "bankAccount",
        label: "Deposit payments to",
        required: true,
        options: accounts.map((a) => ({ id: a.Id, name: `${a.Name} (${a.AccountType})` })),
        suggested: accounts.find((a) => /undeposited/i.test(a.Name))?.Id,
      },
    ];
  },

  async upsertCustomer(ctx, c, existingId) {
    let found: { Id: string; SyncToken: string } | undefined;
    if (existingId) {
      found = (await qbo<{ Customer: { Id: string; SyncToken: string } }>(ctx, `customer/${existingId}`)).Customer;
    } else {
      // Display names are unique in QuickBooks: reuse one that is already there.
      found = (await query<{ Id: string; SyncToken: string }>(ctx, "Customer", `select Id, SyncToken from Customer where DisplayName = '${esc(c.name.slice(0, 500))}'`))[0];
    }
    const [first, last] = splitName(c.contactPerson);
    const r = await qbo<{ Customer: { Id: string } }>(ctx, "customer", {
      method: "POST",
      body: {
        ...(found ? { Id: found.Id, SyncToken: found.SyncToken, sparse: true } : {}),
        DisplayName: c.name.slice(0, 500),
        CompanyName: c.name.slice(0, 100),
        GivenName: first.slice(0, 100),
        FamilyName: last.slice(0, 100),
        ...(c.email ? { PrimaryEmailAddr: { Address: c.email.slice(0, 100) } } : {}),
        ...(c.phone ? { PrimaryPhone: { FreeFormNumber: c.phone.slice(0, 30) } } : {}),
        ...(c.altPhone ? { Mobile: { FreeFormNumber: c.altPhone.slice(0, 30) } } : {}),
        BillAddr: address(c.billingAddress),
        ShipAddr: address(c.siteAddress || c.billingAddress),
        ...(c.vatNumber ? { Notes: `VAT number: ${c.vatNumber}`.slice(0, 2000) } : {}),
      },
    });
    if (!r.Customer?.Id) throw new AccountingError("QuickBooks did not return the customer's ID.");
    return r.Customer.Id;
  },

  async upsertInvoice(ctx, inv, customerId, existingId, { useKuduNumber }) {
    const cfg = ctx.link.config;
    const taxCode = inv.vatRate > 0 ? cfg.taxType : cfg.zeroTaxType || cfg.taxType;
    if (!taxCode) throw new AccountingError("Choose the QuickBooks tax code in Settings → Accounting.");
    if (!cfg.item) throw new AccountingError("Choose the QuickBooks product/service in Settings → Accounting.");
    const existing = existingId ? (await qbo<{ Invoice: { Id: string; SyncToken: string } }>(ctx, `invoice/${existingId}`)).Invoice : null;
    const lines: unknown[] = inv.items.map((it) => ({
      DetailType: "SalesItemLineDetail",
      Amount: rands(Math.round(it.quantity * it.unitPrice)),
      Description: it.description.slice(0, 4000),
      SalesItemLineDetail: { ItemRef: { value: cfg.item }, Qty: it.quantity, UnitPrice: rands(it.unitPrice), TaxCodeRef: { value: taxCode } },
    }));
    if (inv.discount > 0) lines.push({ DetailType: "DiscountLineDetail", Amount: rands(inv.discount), DiscountLineDetail: { PercentBased: false } });
    const r = await qbo<{ Invoice: { Id: string; DocNumber?: string; TotalAmt?: number } }>(ctx, "invoice", {
      method: "POST",
      body: {
        ...(existing ? { Id: existing.Id, SyncToken: existing.SyncToken, sparse: false } : {}),
        CustomerRef: { value: customerId },
        TxnDate: day(inv.issueDate),
        DueDate: day(inv.dueDate),
        ...(useKuduNumber ? { DocNumber: inv.number.slice(0, 21) } : {}),
        PrivateNote: `Kudu ${inv.number}${inv.reference ? ` · ${inv.reference}` : ""}`.slice(0, 4000),
        ...(inv.notes ? { CustomerMemo: { value: inv.notes.slice(0, 1000) } } : {}),
        GlobalTaxCalculation: "TaxExcluded",
        Line: lines,
      },
    });
    if (!r.Invoice?.Id) throw new AccountingError("QuickBooks did not return the invoice's ID.");
    return { id: r.Invoice.Id, number: r.Invoice.DocNumber ?? inv.number, total: typeof r.Invoice.TotalAmt === "number" ? toCents(r.Invoice.TotalAmt) : undefined };
  },

  async createPayment(ctx, p, ext) {
    if (!ctx.link.config.bankAccount) throw new AccountingError("Choose where QuickBooks deposits payments in Settings → Accounting.");
    const r = await qbo<{ Payment: { Id: string } }>(ctx, "payment", {
      method: "POST",
      body: {
        CustomerRef: { value: ext.customerId },
        TotalAmt: rands(p.amount),
        TxnDate: day(p.date),
        PaymentRefNum: (p.reference || p.invoiceNumber).slice(0, 21),
        PrivateNote: `${p.method} for ${p.invoiceNumber} (from Kudu)`.slice(0, 4000),
        DepositToAccountRef: { value: ctx.link.config.bankAccount },
        Line: [{ Amount: rands(p.amount), LinkedTxn: [{ TxnId: ext.invoiceId, TxnType: "Invoice" }] }],
      },
    });
    if (!r.Payment?.Id) throw new AccountingError("QuickBooks did not return the payment's ID.");
    return r.Payment.Id;
  },

  async deletePayment(ctx, paymentId) {
    const { Payment } = await qbo<{ Payment: { Id: string; SyncToken: string } }>(ctx, `payment/${paymentId}`);
    await qbo(ctx, "payment", { method: "POST", query: { operation: "delete" }, body: { Id: Payment.Id, SyncToken: Payment.SyncToken } });
  },

  async getInvoice(ctx, invoiceId) {
    const r = await qbo<{ Invoice?: { TotalAmt?: number; Balance?: number } }>(ctx, `invoice/${invoiceId}`);
    if (typeof r.Invoice?.TotalAmt !== "number" || typeof r.Invoice.Balance !== "number") return null;
    return { total: toCents(r.Invoice.TotalAmt), due: toCents(r.Invoice.Balance) };
  },
};
