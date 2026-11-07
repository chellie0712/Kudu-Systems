import { addressLines, call, day, rands, toCents } from "./http";
import { AccountingError, type ApiAdapter, type Ctx } from "./types";

// Odoo Accounting / Invoicing through Odoo's external API, per company with an API key (no
// platform registration). Odoo 19+ has the JSON-2 API (POST /json/2/<model>/<method>, bearer API
// key); older versions only have JSON-RPC (/jsonrpc execute_kw), which Odoo 19 deprecates.
// Kudu tries JSON-2 first and falls back to JSON-RPC, and remembers which one worked.
// Odoo Online (odoo.com hosting) only allows the external API on the Custom plan.
// Odoo numbers its own invoices; Kudu's number goes into the invoice's Reference.

const WHO = "Odoo";
type C = Record<string, string>;

function base(c: C) {
  const url = (c.url || "").trim().replace(/\/+$/, "").replace(/\/odoo$|\/web$/, "");
  if (!/^https:\/\//.test(url)) throw new AccountingError("Enter the Odoo address starting with https://, e.g. https://yourcompany.odoo.com");
  return url;
}

async function rpc<T>(c: C, service: string, method: string, args: unknown[]): Promise<T> {
  const r = await call<{ result?: T; error?: { data?: { message?: string }; message?: string } }>(WHO, `${base(c)}/jsonrpc`, {
    body: { jsonrpc: "2.0", method: "call", params: { service, method, args }, id: Date.now() },
  });
  if (r.error) throw new AccountingError(`Odoo: ${r.error.data?.message || r.error.message || "error"}`.slice(0, 300));
  return r.result as T;
}

const uidCache = new Map<string, number>();
async function uid(c: C): Promise<number> {
  const key = `${base(c)}|${c.database}|${c.username}`;
  const hit = uidCache.get(key);
  if (hit) return hit;
  const id = await rpc<number | false>(c, "common", "login", [c.database, c.username, c.apiKey]);
  if (!id) throw new AccountingError("Odoo refused the username or API key. Check them in Settings → Accounting.");
  uidCache.set(key, id);
  return id;
}

/** Decides JSON-2 or JSON-RPC once; writes c.api. */
async function detect(c: C): Promise<"json2" | "jsonrpc"> {
  if (c.api === "json2" || c.api === "jsonrpc") return c.api;
  let res: Response;
  try {
    res = await fetch(`${base(c)}/json/2/res.company/search_read`, {
      method: "POST",
      headers: { Authorization: `bearer ${c.apiKey}`, "X-Odoo-Database": c.database, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ domain: [], fields: ["name"], limit: 1 }),
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    throw new AccountingError(`Could not reach Odoo at ${base(c)} (${e instanceof Error ? e.message : e}).`);
  }
  if (res.status === 404) {
    await uid(c); // checks the login
    c.api = "jsonrpc";
  } else if (res.status === 401 || res.status === 403) {
    throw new AccountingError("Odoo refused the API key. Create a new one under your Odoo user → Account Security → API Keys.");
  } else if (res.ok) {
    c.api = "json2";
  } else {
    throw new AccountingError(`Odoo: HTTP ${res.status} from ${base(c)}. Check the address and database name.`);
  }
  return c.api as "json2" | "jsonrpc";
}

/**
 * One model method. `named` is used for JSON-2 (all named), `args`/`kw` for JSON-RPC (positional).
 */
async function odoo<T>(ctx: Ctx, model: string, method: string, p: { named: Record<string, unknown>; args: unknown[]; kw?: Record<string, unknown> }): Promise<T> {
  const c = ctx.link.credentials;
  if (!c.apiKey) throw new AccountingError("Odoo is not connected. Add the Odoo login in Settings → Accounting.");
  const before = c.api;
  const mode = await detect(c);
  if (mode !== before) await ctx.saveCredentials({ ...c });
  if (mode === "json2") {
    return call<T>(WHO, `${base(c)}/json/2/${model}/${method}`, {
      body: p.named,
      headers: { Authorization: `bearer ${c.apiKey}`, "X-Odoo-Database": c.database },
    });
  }
  return rpc<T>(c, "object", "execute_kw", [c.database, await uid(c), c.apiKey, model, method, p.args, p.kw ?? {}]);
}

const searchRead = <T>(ctx: Ctx, model: string, domain: unknown[], fields: string[], limit = 500, order?: string) =>
  odoo<T[]>(ctx, model, "search_read", { named: { domain, fields, limit, ...(order ? { order } : {}) }, args: [domain], kw: { fields, limit, ...(order ? { order } : {}) } });

async function create(ctx: Ctx, model: string, vals: Record<string, unknown>, context?: Record<string, unknown>): Promise<number> {
  const r = await odoo<number | number[]>(ctx, model, "create", { named: { vals_list: [vals], ...(context ? { context } : {}) }, args: [vals], kw: context ? { context } : {} });
  const id = Array.isArray(r) ? r[0] : r;
  if (!id) throw new AccountingError(`Odoo did not return the new ${model} ID.`);
  return id;
}

const write = (ctx: Ctx, model: string, ids: number[], vals: Record<string, unknown>) =>
  odoo(ctx, model, "write", { named: { ids, vals }, args: [ids, vals] });

const act = <T = unknown>(ctx: Ctx, model: string, method: string, ids: number[], context?: Record<string, unknown>) =>
  odoo<T>(ctx, model, method, { named: { ids, ...(context ? { context } : {}) }, args: [ids], kw: context ? { context } : {} });

const read = <T>(ctx: Ctx, model: string, ids: number[], fields: string[]) =>
  odoo<T[]>(ctx, model, "read", { named: { ids, fields }, args: [ids], kw: { fields } });

export const odooAdapter: ApiAdapter = {
  id: "odoo",
  name: "Odoo",
  blurb: "Odoo Invoicing/Accounting (Odoo Online, Odoo.sh or your own server), with an Odoo API key. Odoo Online needs the Custom plan for API access.",
  kind: "api",
  needsOrg: false,
  auth: "login",
  envVars: [],
  configured: () => true,
  pullPerRun: 100,
  notes: "Odoo numbers its own invoices; Kudu's invoice number is in the Odoo invoice's Reference.",
  loginFields: [
    { name: "url", label: "Odoo address", type: "url", placeholder: "https://yourcompany.odoo.com" },
    { name: "database", label: "Database name", help: "Odoo Online: usually the part before .odoo.com. Shown under Settings → Activate developer mode → the database name in the top bar or at /web/database/selector." },
    { name: "username", label: "Odoo login (email)", type: "email", help: "Best a separate Odoo user for Kudu with Accounting / Invoicing rights." },
    { name: "apiKey", label: "API key", type: "password", secret: true, help: "That user → My Profile / Preferences → Account Security → New API Key." },
  ],

  async verifyLogin(c) {
    c.api = "";
    await detect(c);
  },

  organisations: async () => null,

  async pickers(ctx, vatRate) {
    const [taxes, accounts, journals] = await Promise.all([
      searchRead<{ id: number; name: string; amount: number }>(ctx, "account.tax", [["type_tax_use", "=", "sale"], ["active", "=", true]], ["name", "amount"]),
      searchRead<{ id: number; code: string; name: string }>(ctx, "account.account", [["internal_group", "=", "income"]], ["code", "name"]),
      searchRead<{ id: number; name: string; type: string }>(ctx, "account.journal", [["type", "in", ["bank", "cash"]]], ["name", "type"]),
    ]);
    const tax = taxes.map((t) => ({ id: String(t.id), name: `${t.name} (${t.amount}%)`, rate: Number(t.amount) }));
    const opts = tax.map(({ id, name }) => ({ id, name }));
    return [
      { key: "taxType", label: `Sales tax for ${vatRate}% lines`, required: true, options: opts, suggested: tax.find((t) => t.rate === vatRate)?.id },
      { key: "zeroTaxType", label: "Sales tax for 0% invoices", options: opts, suggested: tax.find((t) => t.rate === 0)?.id, help: "Blank = no tax" },
      { key: "salesAccount", label: "Income account for invoice lines", options: accounts.map((a) => ({ id: String(a.id), name: `${a.code ?? ""} ${a.name}`.trim() })), help: "Blank = Odoo's default from the sales journal" },
      { key: "bankAccount", label: "Journal for payments", required: true, options: journals.map((j) => ({ id: String(j.id), name: `${j.name} (${j.type})` })) },
    ];
  },

  async upsertCustomer(ctx, c, existingId) {
    let id = existingId ? Number(existingId) : 0;
    if (!id) {
      const found = await searchRead<{ id: number }>(ctx, "res.partner", [["name", "=", c.name], ["parent_id", "=", false]], ["id"], 1);
      id = found[0]?.id ?? 0;
    }
    const [street = "", street2 = "", city = "", zip = ""] = addressLines(c.billingAddress, 4);
    const vals = {
      name: c.name,
      email: c.email || false,
      phone: c.phone || c.altPhone || false,
      street: street || false,
      street2: street2 || false,
      city: city || false,
      zip: zip || false,
      ...(c.vatNumber ? { vat: c.vatNumber } : {}),
      is_company: true,
      customer_rank: 1,
      comment: c.contactPerson ? `Contact: ${c.contactPerson}` : false,
    };
    if (id) await write(ctx, "res.partner", [id], vals);
    else id = await create(ctx, "res.partner", vals);
    return String(id);
  },

  async upsertInvoice(ctx, inv, customerId, existingId) {
    const cfg = ctx.link.config;
    const taxId = inv.vatRate > 0 ? cfg.taxType : cfg.zeroTaxType;
    if (inv.vatRate > 0 && !taxId) throw new AccountingError("Choose the Odoo sales tax in Settings → Accounting.");
    const lines = inv.items.map((it) => [
      0,
      0,
      {
        name: it.description,
        quantity: it.quantity,
        price_unit: rands(it.unitPrice),
        discount: inv.discountPct,
        tax_ids: [[6, 0, taxId ? [Number(taxId)] : []]],
        ...(cfg.salesAccount ? { account_id: Number(cfg.salesAccount) } : {}),
      },
    ]);
    const vals = {
      partner_id: Number(customerId),
      invoice_date: day(inv.issueDate),
      invoice_date_due: day(inv.dueDate),
      ref: [inv.number, inv.reference].filter(Boolean).join(" · "),
      narration: inv.notes || false,
    };
    let id = existingId ? Number(existingId) : 0;
    if (id) {
      const [cur] = await read<{ amount_total: number; amount_residual: number; state: string }>(ctx, "account.move", [id], ["amount_total", "amount_residual", "state"]);
      if (cur && cur.amount_residual < cur.amount_total - 0.005) throw new AccountingError("This invoice has payments in Odoo, so Kudu won't change it. Change it in Odoo.");
      if (cur?.state === "posted") await act(ctx, "account.move", "button_draft", [id]);
      await write(ctx, "account.move", [id], { ...vals, invoice_line_ids: [[5, 0, 0], ...lines] });
    } else {
      id = await create(ctx, "account.move", { move_type: "out_invoice", ...vals, invoice_line_ids: lines });
    }
    await act(ctx, "account.move", "action_post", [id]);
    const [saved] = await read<{ name: string; amount_total: number }>(ctx, "account.move", [id], ["name", "amount_total"]);
    return { id: String(id), number: saved?.name ?? inv.number, total: saved ? toCents(saved.amount_total) : undefined };
  },

  async createPayment(ctx, p, ext) {
    const journal = ctx.link.config.bankAccount;
    if (!journal) throw new AccountingError("Choose the Odoo payment journal in Settings → Accounting.");
    const context = { active_model: "account.move", active_ids: [Number(ext.invoiceId)] };
    // The "Register payment" wizard creates the payment and reconciles it with the invoice.
    const wizard = await create(
      ctx,
      "account.payment.register",
      { amount: rands(p.amount), payment_date: day(p.date), journal_id: Number(journal), communication: `${p.invoiceNumber}${p.reference ? ` ${p.reference}` : ""}` },
      context,
    );
    const action = await act<{ res_id?: number } | boolean>(ctx, "account.payment.register", "action_create_payments", [wizard], context);
    let id = typeof action === "object" && action?.res_id ? action.res_id : 0;
    if (!id) {
      const found = await searchRead<{ id: number }>(ctx, "account.payment", [["partner_id", "=", Number(ext.customerId)], ["amount", "=", rands(p.amount)]], ["id"], 1, "id desc");
      id = found[0]?.id ?? 0;
    }
    if (!id) throw new AccountingError("The payment was registered in Odoo, but Odoo did not say which one it is. Check the invoice in Odoo.");
    return String(id);
  },

  async deletePayment(ctx, paymentId) {
    await act(ctx, "account.payment", "action_draft", [Number(paymentId)]);
    await act(ctx, "account.payment", "action_cancel", [Number(paymentId)]);
  },

  async getInvoice(ctx, invoiceId) {
    const [r] = await read<{ amount_total: number; amount_residual: number }>(ctx, "account.move", [Number(invoiceId)], ["amount_total", "amount_residual"]);
    if (!r) return null;
    return { total: toCents(r.amount_total), due: toCents(r.amount_residual) };
  },
};
