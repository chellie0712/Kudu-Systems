import { accessToken, addressLines, basic, call, day, rands, splitName, toCents, tokenFields } from "./http";
import { AccountingError, type ApiAdapter, type Ctx } from "./types";

// Xero Accounting API (OAuth 2.0, one Xero app for the whole platform; each company connects
// its own Xero organisation). https://developer.xero.com/documentation/api/accounting/overview
// Limits: 60 calls a minute and 5,000 a day per organisation. Access tokens last 30 minutes;
// the refresh token is replaced on every refresh (kept in AccountingLink.credentials).
// Apps created from 2 March 2026 must use Xero's granular scopes (accounting.invoices,
// accounting.payments) instead of accounting.transactions. XERO_SCOPES overrides the list.

const WHO = "Xero";
const API = "https://api.xero.com/api.xro/2.0";
const SCOPES = () =>
  process.env.XERO_SCOPES || "openid profile email offline_access accounting.contacts accounting.settings accounting.invoices accounting.payments";
const id = () => process.env.XERO_CLIENT_ID || "";
const secret = () => process.env.XERO_CLIENT_SECRET || "";

async function tokens(form: Record<string, string>) {
  return call<{ access_token: string; refresh_token?: string; expires_in?: number }>(WHO, "https://identity.xero.com/connect/token", {
    headers: { Authorization: basic(id(), secret()) },
    form,
  });
}

async function xero<T>(ctx: Ctx, path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!ctx.link.orgId) throw new AccountingError("Choose your Xero organisation in Settings → Accounting.");
  const token = await accessToken(ctx, WHO, (refresh_token) => tokens({ grant_type: "refresh_token", refresh_token }));
  return call<T>(WHO, `${API}/${path}`, { ...opts, headers: { Authorization: `Bearer ${token}`, "Xero-tenant-id": ctx.link.orgId } });
}

const quote = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

export const xeroAdapter: ApiAdapter = {
  id: "xero",
  name: "Xero",
  blurb: "Xero online accounting. Connect signs you in to Xero and asks which organisation Kudu may use.",
  kind: "api",
  needsOrg: true,
  auth: "oauth",
  envVars: [
    { name: "XERO_CLIENT_ID", required: true, help: "Client id of Kudu's Xero app (developer.xero.com → My Apps)." },
    { name: "XERO_CLIENT_SECRET", required: true, help: "Client secret of the same app." },
    { name: "XERO_SCOPES", required: false, help: "Only if Xero asks for different scopes than the default." },
  ],
  configured: () => Boolean(id() && secret()),
  pullPerRun: 50,
  notes: "Xero won't change an invoice that already has a payment on it: change it in Xero (remove the payment first).",

  authorizeUrl(state, redirectUri) {
    const u = new URL("https://login.xero.com/identity/connect/authorize");
    u.search = new URLSearchParams({ response_type: "code", client_id: id(), redirect_uri: redirectUri, scope: SCOPES(), state }).toString();
    return u.toString();
  },

  async exchangeCode(params, redirectUri) {
    const t = await tokens({ grant_type: "authorization_code", code: params.get("code") ?? "", redirect_uri: redirectUri });
    if (!t.refresh_token) throw new AccountingError("Xero did not give long-term access (offline_access). Check the app's scopes.");
    // Exactly one organisation chosen on Xero's screen: use it straight away.
    const orgs = await call<{ tenantId: string; tenantName: string; tenantType: string }[]>(WHO, "https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    const list = orgs.filter((o) => o.tenantType === "ORGANISATION");
    return { credentials: tokenFields(t), ...(list.length === 1 ? { orgId: list[0].tenantId, orgName: list[0].tenantName } : {}) };
  },

  async organisations(ctx) {
    const token = await accessToken(ctx, WHO, (refresh_token) => tokens({ grant_type: "refresh_token", refresh_token }));
    const orgs = await call<{ tenantId: string; tenantName: string; tenantType: string }[]>(WHO, "https://api.xero.com/connections", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return orgs.filter((o) => o.tenantType === "ORGANISATION").map((o) => ({ id: o.tenantId, name: o.tenantName }));
  },

  async pickers(ctx, vatRate) {
    const [{ TaxRates }, { Accounts }] = await Promise.all([
      xero<{ TaxRates: { Name: string; TaxType: string; EffectiveRate?: number; DisplayTaxRate?: number; Status: string; CanApplyToRevenue?: boolean }[] }>(ctx, "TaxRates"),
      xero<{ Accounts: { AccountID: string; Code?: string; Name: string; Type: string; Class?: string; Status: string; EnablePaymentsToAccount?: boolean }[] }>(ctx, "Accounts"),
    ]);
    const taxes = TaxRates.filter((t) => t.Status === "ACTIVE" && t.CanApplyToRevenue !== false).map((t) => ({
      id: t.TaxType,
      name: `${t.Name} (${t.DisplayTaxRate ?? t.EffectiveRate ?? 0}%)`,
      rate: Number(t.DisplayTaxRate ?? t.EffectiveRate ?? -1),
    }));
    const live = Accounts.filter((a) => a.Status === "ACTIVE");
    const revenue = live.filter((a) => a.Class === "REVENUE" && a.Code).map((a) => ({ id: a.Code!, name: `${a.Code} · ${a.Name}` }));
    const banks = live.filter((a) => a.Type === "BANK" || a.EnablePaymentsToAccount).map((a) => ({ id: a.AccountID, name: a.Code ? `${a.Code} · ${a.Name}` : a.Name }));
    const opts = taxes.map(({ id, name }) => ({ id, name }));
    return [
      { key: "taxType", label: `Tax rate for ${vatRate}% lines`, required: true, options: opts, suggested: taxes.find((t) => t.rate === vatRate)?.id },
      { key: "zeroTaxType", label: "Tax rate for 0% invoices", options: opts, suggested: taxes.find((t) => t.rate === 0)?.id, help: "Blank = same as above" },
      { key: "salesAccount", label: "Sales (revenue) account for invoice lines", required: true, options: revenue, suggested: revenue.find((r) => r.id === "200")?.id },
      { key: "bankAccount", label: "Bank account for payments", required: true, options: banks },
    ];
  },

  async upsertCustomer(ctx, c, existingId) {
    let contactId = existingId;
    if (!contactId) {
      // Xero contact names are unique: reuse one that is already there.
      const found = await xero<{ Contacts: { ContactID: string }[] }>(ctx, `Contacts?where=${encodeURIComponent(`Name=="${quote(c.name)}"`)}`);
      contactId = found.Contacts?.[0]?.ContactID ?? null;
    }
    const [first, last] = splitName(c.contactPerson);
    const lines = (text: string) => Object.fromEntries(addressLines(text, 4).map((l, i) => [`AddressLine${i + 1}`, l.slice(0, 500)]));
    const r = await xero<{ Contacts: { ContactID: string }[] }>(ctx, "Contacts", {
      method: "POST",
      body: {
        Contacts: [
          {
            ...(contactId ? { ContactID: contactId } : {}),
            Name: c.name.slice(0, 255),
            FirstName: first.slice(0, 255),
            LastName: last.slice(0, 255),
            EmailAddress: c.email.slice(0, 255),
            TaxNumber: c.vatNumber.slice(0, 50),
            IsCustomer: true,
            Phones: [
              { PhoneType: "DEFAULT", PhoneNumber: c.phone.slice(0, 50) },
              { PhoneType: "MOBILE", PhoneNumber: c.altPhone.slice(0, 50) },
            ],
            Addresses: [
              { AddressType: "POBOX", ...lines(c.billingAddress) },
              { AddressType: "STREET", ...lines(c.siteAddress || c.billingAddress) },
            ],
          },
        ],
      },
    });
    const saved = r.Contacts?.[0]?.ContactID;
    if (!saved) throw new AccountingError("Xero did not return the contact's ID.");
    return saved;
  },

  async upsertInvoice(ctx, inv, customerId, existingId, { useKuduNumber }) {
    const cfg = ctx.link.config;
    const taxType = inv.vatRate > 0 ? cfg.taxType : cfg.zeroTaxType || cfg.taxType;
    if (!taxType) throw new AccountingError("Choose the Xero tax rate in Settings → Accounting.");
    if (!cfg.salesAccount) throw new AccountingError("Choose the Xero sales account in Settings → Accounting.");
    const r = await xero<{ Invoices: { InvoiceID: string; InvoiceNumber?: string; Total?: number }[] }>(ctx, "Invoices", {
      method: "POST",
      body: {
        Invoices: [
          {
            ...(existingId ? { InvoiceID: existingId } : {}),
            Type: "ACCREC",
            Contact: { ContactID: customerId },
            Date: day(inv.issueDate),
            DueDate: day(inv.dueDate),
            ...(useKuduNumber ? { InvoiceNumber: inv.number } : {}),
            Reference: (inv.reference || inv.number).slice(0, 255),
            LineAmountTypes: "Exclusive",
            Status: "AUTHORISED",
            LineItems: inv.items.map((it) => ({
              Description: it.description.slice(0, 4000),
              Quantity: it.quantity,
              UnitAmount: rands(it.unitPrice),
              AccountCode: cfg.salesAccount,
              TaxType: taxType,
              ...(inv.discountPct > 0 ? { DiscountRate: inv.discountPct } : {}),
            })),
          },
        ],
      },
    });
    const saved = r.Invoices?.[0];
    if (!saved?.InvoiceID) throw new AccountingError("Xero did not return the invoice's ID.");
    return { id: saved.InvoiceID, number: saved.InvoiceNumber ?? inv.number, total: typeof saved.Total === "number" ? toCents(saved.Total) : undefined };
  },

  async createPayment(ctx, p, ext) {
    if (!ctx.link.config.bankAccount) throw new AccountingError("Choose the Xero bank account for payments in Settings → Accounting.");
    const r = await xero<{ Payments: { PaymentID: string }[] }>(ctx, "Payments", {
      method: "PUT",
      body: {
        Payments: [
          {
            Invoice: { InvoiceID: ext.invoiceId },
            Account: { AccountID: ctx.link.config.bankAccount },
            Date: day(p.date),
            Amount: rands(p.amount),
            Reference: `${p.method}${p.reference ? ` ${p.reference}` : ""}`.slice(0, 255),
          },
        ],
      },
    });
    const saved = r.Payments?.[0]?.PaymentID;
    if (!saved) throw new AccountingError("Xero did not return the payment's ID.");
    return saved;
  },

  async deletePayment(ctx, paymentId) {
    await xero(ctx, `Payments/${paymentId}`, { method: "POST", body: { Status: "DELETED" } });
  },

  async getInvoice(ctx, invoiceId) {
    const r = await xero<{ Invoices: { Total?: number; AmountDue?: number }[] }>(ctx, `Invoices/${invoiceId}`);
    const i = r.Invoices?.[0];
    if (typeof i?.Total !== "number" || typeof i.AmountDue !== "number") return null;
    return { total: toCents(i.Total), due: toCents(i.AmountDue) };
  },
};
