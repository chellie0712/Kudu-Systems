import { accessToken, addressLines, call, day, rands, splitName, toCents, tokenFields } from "./http";
import { AccountingError, type ApiAdapter, type Ctx } from "./types";

// FreshBooks Accounting API (OAuth 2.0, one FreshBooks app for the platform; each company
// connects its own FreshBooks business). https://www.freshbooks.com/api/start
// FreshBooks has no chart-of-accounts choice per invoice line and no bank account on payments,
// so only the tax is chosen. Access tokens last 12 hours; the refresh token is single-use.

const WHO = "FreshBooks";
const id = () => process.env.FRESHBOOKS_CLIENT_ID || "";
const secret = () => process.env.FRESHBOOKS_CLIENT_SECRET || "";
const API = "https://api.freshbooks.com";
const SCOPES = [
  "user:profile:read",
  "user:clients:read",
  "user:clients:write",
  "user:invoices:read",
  "user:invoices:write",
  "user:payments:read",
  "user:payments:write",
  "user:taxes:read",
].join(" ");

type Res<T> = { response: { result: T } };

function tokenCall(body: Record<string, string>) {
  return call<{ access_token: string; refresh_token?: string; expires_in?: number }>(WHO, `${API}/auth/oauth/token`, {
    body: { client_id: id(), client_secret: secret(), ...body },
  });
}

async function token(ctx: Ctx) {
  return accessToken(ctx, WHO, (refresh_token) => tokenCall({ grant_type: "refresh_token", refresh_token, redirect_uri: ctx.link.credentials.redirect_uri ?? "" }));
}

async function fb<T>(ctx: Ctx, path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  if (!ctx.link.orgId) throw new AccountingError("Choose your FreshBooks business in Settings → Accounting.");
  const t = await token(ctx);
  const r = await call<Res<T>>(WHO, `${API}/accounting/account/${ctx.link.orgId}/${path}`, { ...opts, headers: { Authorization: `Bearer ${t}`, "Api-Version": "alpha" } });
  return r.response.result;
}

const money = (cents: number, code: string) => ({ amount: rands(cents).toFixed(2), code });

/** FreshBooks only accepts its own list of payment types. */
function paymentType(method: string): string {
  if (/cash/i.test(method)) return "Cash";
  if (/card|visa|master/i.test(method)) return "Credit Card";
  if (/debit/i.test(method)) return "Debit";
  if (/cheque|check/i.test(method)) return "Check";
  if (/eft|transfer|bank|deposit/i.test(method)) return "Bank Transfer";
  return "Other";
}

export const freshbooksAdapter: ApiAdapter = {
  id: "freshbooks",
  name: "FreshBooks",
  blurb: "FreshBooks online invoicing and accounting. Connect signs you in to FreshBooks; then choose the business.",
  kind: "api",
  needsOrg: true,
  auth: "oauth",
  envVars: [
    { name: "FRESHBOOKS_CLIENT_ID", required: true, help: "Client ID of Kudu's FreshBooks app (my.freshbooks.com/#/developer)." },
    { name: "FRESHBOOKS_CLIENT_SECRET", required: true, help: "Client Secret of the same app." },
  ],
  configured: () => Boolean(id() && secret()),
  pullPerRun: 50,
  notes: "Invoices are marked as sent in FreshBooks without emailing the customer.",

  authorizeUrl(state, redirectUri) {
    const u = new URL("https://auth.freshbooks.com/oauth/authorize");
    u.search = new URLSearchParams({ client_id: id(), response_type: "code", redirect_uri: redirectUri, scope: SCOPES, state }).toString();
    return u.toString();
  },

  async exchangeCode(params, redirectUri) {
    const t = await tokenCall({ grant_type: "authorization_code", code: params.get("code") ?? "", redirect_uri: redirectUri });
    // FreshBooks wants the same redirect URI on every refresh.
    return { credentials: { ...tokenFields(t), redirect_uri: redirectUri } };
  },

  async organisations(ctx) {
    const t = await token(ctx);
    const me = await call<{ response: { business_memberships?: { business: { account_id?: string; name: string } }[] } }>(WHO, `${API}/auth/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${t}` },
    });
    return (me.response.business_memberships ?? []).filter((m) => m.business.account_id).map((m) => ({ id: m.business.account_id!, name: m.business.name }));
  },

  async pickers(ctx, vatRate) {
    const r = await fb<{ taxes: { taxid: number; name: string; amount: string }[] }>(ctx, "taxes/taxes");
    // The tax is sent by name and percentage, so both are kept in the option's value.
    const taxes = (r.taxes ?? []).map((t) => ({ id: `${t.name}|${t.amount}`, name: `${t.name} (${t.amount}%)`, rate: Number(t.amount) }));
    return [
      {
        key: "taxType",
        label: `Tax for ${vatRate}% lines`,
        required: true,
        options: taxes.map(({ id, name }) => ({ id, name })),
        suggested: taxes.find((t) => t.rate === vatRate)?.id,
        help: "Add a tax called VAT at 15% in FreshBooks (Settings → Taxes) if it isn't listed.",
      },
      { key: "currency", label: "Currency code", placeholder: "ZAR", suggested: "ZAR", help: "Must match the FreshBooks business currency." },
    ];
  },

  async upsertCustomer(ctx, c, existingId) {
    const [first, last] = splitName(c.contactPerson);
    const [street = "", street2 = "", city = "", ...rest] = addressLines(c.billingAddress, 4);
    const client = {
      organization: c.name.slice(0, 200),
      fname: first.slice(0, 100),
      lname: last.slice(0, 100),
      email: c.email.slice(0, 200),
      bus_phone: c.phone.slice(0, 50),
      mob_phone: c.altPhone.slice(0, 50),
      p_street: street,
      p_street2: street2,
      p_city: city,
      p_province: rest.join(", "),
      ...(c.vatNumber ? { vat_name: "VAT", vat_number: c.vatNumber.slice(0, 50) } : {}),
    };
    const r = existingId
      ? await fb<{ client: { id: number } }>(ctx, `users/clients/${existingId}`, { method: "PUT", body: { client } })
      : await fb<{ client: { id: number } }>(ctx, "users/clients", { method: "POST", body: { client } });
    if (!r.client?.id) throw new AccountingError("FreshBooks did not return the client's ID.");
    return String(r.client.id);
  },

  async upsertInvoice(ctx, inv, customerId, existingId, { useKuduNumber }) {
    const cfg = ctx.link.config;
    const currency = cfg.currency || "ZAR";
    const [taxName, taxPct] = (cfg.taxType || "").split("|");
    if (inv.vatRate > 0 && !taxName) throw new AccountingError("Choose the FreshBooks tax in Settings → Accounting.");
    const dueDays = Math.max(0, Math.round((inv.dueDate.getTime() - inv.issueDate.getTime()) / 86400000));
    const invoice = {
      customerid: Number(customerId),
      create_date: day(inv.issueDate),
      due_offset_days: dueDays,
      ...(useKuduNumber ? { invoice_number: inv.number.slice(0, 50) } : {}),
      po_number: inv.reference.slice(0, 50),
      currency_code: currency,
      notes: inv.notes,
      discount_value: inv.discountPct > 0 ? String(inv.discountPct) : "0",
      lines: inv.items.map((it) => ({
        type: 0,
        name: it.description.slice(0, 100),
        description: it.description.length > 100 ? it.description : "",
        qty: it.quantity,
        unit_cost: money(it.unitPrice, currency),
        ...(inv.vatRate > 0 ? { taxName1: taxName, taxAmount1: Number(taxPct || inv.vatRate) } : {}),
      })),
      action_mark_as_sent: true,
    };
    const r = existingId
      ? await fb<{ invoice: { id: number; invoice_number?: string; amount?: { amount: string } } }>(ctx, `invoices/invoices/${existingId}`, { method: "PUT", body: { invoice } })
      : await fb<{ invoice: { id: number; invoice_number?: string; amount?: { amount: string } } }>(ctx, "invoices/invoices", { method: "POST", body: { invoice } });
    if (!r.invoice?.id) throw new AccountingError("FreshBooks did not return the invoice's ID.");
    return { id: String(r.invoice.id), number: r.invoice.invoice_number ?? inv.number, total: r.invoice.amount ? toCents(r.invoice.amount.amount) : undefined };
  },

  async createPayment(ctx, p, ext) {
    const r = await fb<{ payment: { id: number } }>(ctx, "payments/payments", {
      method: "POST",
      body: {
        payment: {
          invoiceid: Number(ext.invoiceId),
          amount: { amount: rands(p.amount).toFixed(2) },
          date: day(p.date),
          type: paymentType(p.method),
          note: `From Kudu${p.reference ? `: ${p.reference}` : ""}`.slice(0, 500),
        },
      },
    });
    if (!r.payment?.id) throw new AccountingError("FreshBooks did not return the payment's ID.");
    return String(r.payment.id);
  },

  async deletePayment(ctx, paymentId) {
    await fb(ctx, `payments/payments/${paymentId}`, { method: "PUT", body: { payment: { vis_state: 1 } } });
  },

  async getInvoice(ctx, invoiceId) {
    const r = await fb<{ invoice?: { amount?: { amount: string }; outstanding?: { amount: string } } }>(ctx, `invoices/invoices/${invoiceId}`);
    if (!r.invoice?.amount || !r.invoice.outstanding) return null;
    return { total: toCents(r.invoice.amount.amount), due: toCents(r.invoice.outstanding.amount) };
  },
};
