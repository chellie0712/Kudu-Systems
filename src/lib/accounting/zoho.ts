import { accessToken, addressLines, call, day, rands, splitName, toCents, tokenFields } from "./http";
import { AccountingError, type ApiAdapter, type Ctx } from "./types";

// Zoho Books API v3 (OAuth 2.0, one Zoho client for the platform; each company connects its own
// Zoho Books organisation). https://www.zoho.com/books/api/v3/
// Zoho runs separate data centres (zoho.com, .eu, .in, .com.au...). The sign-in starts on
// ZOHO_ACCOUNTS_URL; Zoho sends back which accounts server the user belongs to, and the token
// says which API domain to use, so "Multi-DC" must be ticked on the client in Zoho's API console.
// Limits: 100 requests a minute per organisation, daily cap by plan (1,000 on Free).
// Access tokens last 1 hour; the refresh token does not change.

const WHO = "Zoho Books";
const id = () => process.env.ZOHO_CLIENT_ID || "";
const secret = () => process.env.ZOHO_CLIENT_SECRET || "";
const ACCOUNTS = () => (process.env.ZOHO_ACCOUNTS_URL || "https://accounts.zoho.com").replace(/\/$/, "");
const SCOPE = "ZohoBooks.fullaccess.all";

type Res<T> = T & { code?: number; message?: string };

async function zoho<T>(ctx: Ctx, path: string, opts: { method?: string; body?: unknown; query?: Record<string, string>; org?: boolean } = {}): Promise<T> {
  const c = ctx.link.credentials;
  const server = c.accounts_server || ACCOUNTS();
  const token = await accessToken(ctx, WHO, (refresh_token) =>
    call(WHO, `${server}/oauth/v2/token`, { form: { grant_type: "refresh_token", client_id: id(), client_secret: secret(), refresh_token } }),
  );
  const u = new URL(`${(c.api_domain || "https://www.zohoapis.com").replace(/\/$/, "")}/books/v3/${path}`);
  if (opts.org !== false) {
    if (!ctx.link.orgId) throw new AccountingError("Choose your Zoho Books organisation in Settings → Accounting.");
    u.searchParams.set("organization_id", ctx.link.orgId);
  }
  for (const [k, v] of Object.entries(opts.query ?? {})) u.searchParams.set(k, v);
  const r = await call<Res<T>>(WHO, u.toString(), { method: opts.method, body: opts.body, headers: { Authorization: `Zoho-oauthtoken ${token}` } });
  if (r && typeof r.code === "number" && r.code !== 0) throw new AccountingError(`${WHO}: ${r.message ?? `error ${r.code}`}`);
  return r;
}

function address(text: string) {
  const [address = "", street2 = "", city = "", ...rest] = addressLines(text, 4);
  return { address: address.slice(0, 500), street2: street2.slice(0, 255), city: city.slice(0, 100), state: rest.join(", ").slice(0, 100) };
}

export const zohoAdapter: ApiAdapter = {
  id: "zoho",
  name: "Zoho Books",
  blurb: "Zoho Books online accounting. Connect signs you in to Zoho; then choose the organisation.",
  kind: "api",
  needsOrg: true,
  auth: "oauth",
  envVars: [
    { name: "ZOHO_CLIENT_ID", required: true, help: "Client ID of Kudu's Zoho server-based client (api-console.zoho.com)." },
    { name: "ZOHO_CLIENT_SECRET", required: true, help: "Client Secret of the same client." },
    { name: "ZOHO_ACCOUNTS_URL", required: false, help: "Zoho data centre the client was made in, if not https://accounts.zoho.com (e.g. https://accounts.zoho.eu)." },
  ],
  configured: () => Boolean(id() && secret()),
  pullPerRun: 50,
  notes: "Invoices are created in Zoho Books and then marked as sent there; Zoho does not email the customer.",

  authorizeUrl(state, redirectUri) {
    const u = new URL(`${ACCOUNTS()}/oauth/v2/auth`);
    u.search = new URLSearchParams({ scope: SCOPE, client_id: id(), response_type: "code", redirect_uri: redirectUri, access_type: "offline", prompt: "consent", state }).toString();
    return u.toString();
  },

  async exchangeCode(params, redirectUri) {
    // Zoho tells us which data centre the user signed in to.
    const server = (params.get("accounts-server") || ACCOUNTS()).replace(/\/$/, "");
    if (!/^https:\/\/accounts\.zoho\.[a-z.]+$/.test(server)) throw new AccountingError("Zoho returned an unexpected sign-in server.");
    const t = await call<{ access_token: string; refresh_token?: string; expires_in?: number; api_domain?: string; error?: string }>(WHO, `${server}/oauth/v2/token`, {
      form: { grant_type: "authorization_code", client_id: id(), client_secret: secret(), redirect_uri: redirectUri, code: params.get("code") ?? "" },
    });
    if (t.error) throw new AccountingError(`Zoho sign-in failed (${t.error}).`);
    if (!t.refresh_token) throw new AccountingError("Zoho did not give long-term access. Remove Kudu under Zoho Accounts → Connected Apps, then connect again.");
    return { credentials: { ...tokenFields(t), accounts_server: server, api_domain: t.api_domain || "https://www.zohoapis.com" } };
  },

  async organisations(ctx) {
    const r = await zoho<{ organizations: { organization_id: string; name: string }[] }>(ctx, "organizations", { org: false });
    return (r.organizations ?? []).map((o) => ({ id: String(o.organization_id), name: o.name }));
  },

  async pickers(ctx, vatRate) {
    const [taxes, accounts, banks] = await Promise.all([
      zoho<{ taxes: { tax_id: string; tax_name: string; tax_percentage: number }[] }>(ctx, "settings/taxes"),
      zoho<{ chartofaccounts: { account_id: string; account_name: string; account_type: string; is_active?: boolean }[] }>(ctx, "chartofaccounts"),
      zoho<{ bankaccounts: { account_id: string; account_name: string; is_active?: boolean }[] }>(ctx, "bankaccounts"),
    ]);
    const tax = (taxes.taxes ?? []).map((t) => ({ id: String(t.tax_id), name: `${t.tax_name} (${t.tax_percentage}%)`, rate: Number(t.tax_percentage) }));
    const opts = tax.map(({ id, name }) => ({ id, name }));
    const income = (accounts.chartofaccounts ?? []).filter((a) => a.is_active !== false && /income/i.test(a.account_type) && !/other/i.test(a.account_type));
    return [
      { key: "taxType", label: `Tax for ${vatRate}% lines`, required: true, options: opts, suggested: tax.find((t) => t.rate === vatRate)?.id },
      { key: "zeroTaxType", label: "Tax for 0% invoices", options: opts, help: "Blank = no tax on 0% invoices" },
      { key: "salesAccount", label: "Sales (income) account for invoice lines", options: income.map((a) => ({ id: String(a.account_id), name: a.account_name })), help: "Blank = Zoho's default Sales account" },
      { key: "bankAccount", label: "Deposit payments to", required: true, options: (banks.bankaccounts ?? []).filter((b) => b.is_active !== false).map((b) => ({ id: String(b.account_id), name: b.account_name })) },
    ];
  },

  async upsertCustomer(ctx, c, existingId) {
    let contactId = existingId;
    if (!contactId) {
      const found = await zoho<{ contacts: { contact_id: string; contact_name: string }[] }>(ctx, "contacts", { query: { contact_name: c.name, contact_type: "customer" } });
      contactId = found.contacts?.find((x) => x.contact_name === c.name)?.contact_id ?? null;
    }
    const [first, last] = splitName(c.contactPerson || c.name);
    const body = {
      contact_name: c.name.slice(0, 200),
      company_name: c.name.slice(0, 200),
      contact_type: "customer",
      billing_address: { ...address(c.billingAddress), phone: c.phone.slice(0, 50) },
      shipping_address: address(c.siteAddress || c.billingAddress),
      ...(c.vatNumber ? { notes: `VAT number: ${c.vatNumber}` } : {}),
      // Contact persons are only set when the contact is created, so edits in Zoho aren't overwritten.
      ...(contactId
        ? {}
        : { contact_persons: [{ first_name: first.slice(0, 100), last_name: last.slice(0, 100), email: c.email.slice(0, 100), phone: c.phone.slice(0, 50), mobile: c.altPhone.slice(0, 50), is_primary_contact: true }] }),
    };
    const r = contactId
      ? await zoho<{ contact: { contact_id: string } }>(ctx, `contacts/${contactId}`, { method: "PUT", body })
      : await zoho<{ contact: { contact_id: string } }>(ctx, "contacts", { method: "POST", body });
    if (!r.contact?.contact_id) throw new AccountingError("Zoho Books did not return the contact's ID.");
    return String(r.contact.contact_id);
  },

  async upsertInvoice(ctx, inv, customerId, existingId, { useKuduNumber }) {
    const cfg = ctx.link.config;
    const taxId = inv.vatRate > 0 ? cfg.taxType : cfg.zeroTaxType;
    if (inv.vatRate > 0 && !taxId) throw new AccountingError("Choose the Zoho Books tax in Settings → Accounting.");
    const body = {
      customer_id: customerId,
      ...(useKuduNumber ? { invoice_number: inv.number } : {}),
      date: day(inv.issueDate),
      due_date: day(inv.dueDate),
      reference_number: (inv.reference || inv.number).slice(0, 100),
      notes: inv.notes.slice(0, 5000),
      is_inclusive_tax: false,
      ...(inv.discount > 0 ? { discount: rands(inv.discount), discount_type: "entity_level", is_discount_before_tax: true } : {}),
      line_items: inv.items.map((it) => ({
        description: it.description.slice(0, 2000),
        rate: rands(it.unitPrice),
        quantity: it.quantity,
        unit: it.unit.slice(0, 100),
        ...(taxId ? { tax_id: taxId } : {}),
        ...(cfg.salesAccount ? { account_id: cfg.salesAccount } : {}),
      })),
    };
    const query = useKuduNumber ? { ignore_auto_number_generation: "true" } : undefined;
    const r = existingId
      ? await zoho<{ invoice: { invoice_id: string; invoice_number?: string; total?: number; status?: string } }>(ctx, `invoices/${existingId}`, { method: "PUT", body, query })
      : await zoho<{ invoice: { invoice_id: string; invoice_number?: string; total?: number; status?: string } }>(ctx, "invoices", { method: "POST", body, query });
    const saved = r.invoice;
    if (!saved?.invoice_id) throw new AccountingError("Zoho Books did not return the invoice's ID.");
    if (!saved.status || saved.status === "draft") await zoho(ctx, `invoices/${saved.invoice_id}/status/sent`, { method: "POST" });
    return { id: String(saved.invoice_id), number: saved.invoice_number ?? inv.number, total: typeof saved.total === "number" ? toCents(saved.total) : undefined };
  },

  async createPayment(ctx, p, ext) {
    if (!ctx.link.config.bankAccount) throw new AccountingError("Choose the Zoho Books deposit account in Settings → Accounting.");
    const r = await zoho<{ payment: { payment_id: string } }>(ctx, "customerpayments", {
      method: "POST",
      body: {
        customer_id: ext.customerId,
        payment_mode: p.method.slice(0, 100) || "Bank Transfer",
        amount: rands(p.amount),
        date: day(p.date),
        reference_number: (p.reference || p.invoiceNumber).slice(0, 100),
        description: `From Kudu, for ${p.invoiceNumber}`,
        account_id: ctx.link.config.bankAccount,
        invoices: [{ invoice_id: ext.invoiceId, amount_applied: rands(p.amount) }],
      },
    });
    if (!r.payment?.payment_id) throw new AccountingError("Zoho Books did not return the payment's ID.");
    return String(r.payment.payment_id);
  },

  async deletePayment(ctx, paymentId) {
    await zoho(ctx, `customerpayments/${paymentId}`, { method: "DELETE" });
  },

  async getInvoice(ctx, invoiceId) {
    const r = await zoho<{ invoice?: { total?: number; balance?: number } }>(ctx, `invoices/${invoiceId}`);
    if (typeof r.invoice?.total !== "number" || typeof r.invoice.balance !== "number") return null;
    return { total: toCents(r.invoice.total), due: toCents(r.invoice.balance) };
  },
};
