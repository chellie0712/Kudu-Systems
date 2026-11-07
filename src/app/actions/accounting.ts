"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { fromLocalInput, money } from "@/lib/format";
import { adapter, apiAdapter, isProvider, shortName } from "@/lib/accounting";
import { ctxFor, loadLink, saveLink } from "@/lib/accounting/store";
import { pullPayments, sendInvoice, sendPayment } from "@/lib/accounting/sync";
import { importReceipts } from "@/lib/accounting/pastelFiles";
import { AccountingError } from "@/lib/accounting/types";

const enc = encodeURIComponent;
const toSettings = (key: "msg" | "err", text: string) => `/settings?${key}=${enc(text)}#accounting`;
const why = (e: unknown) => (e instanceof AccountingError ? e.message : e instanceof Error ? e.message : String(e));

/** Picks the package this company uses (one at a time). Nothing is sent until it is connected. */
export async function chooseAccountingProvider(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const provider = str(fd, "provider");
  if (provider && !isProvider(provider)) redirect(toSettings("err", "Unknown accounting package."));
  const before = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  if (before.accountingProvider === provider) redirect(toSettings("msg", "No change."));
  await db.settings.update({
    where: { id: 1 },
    // From now on: older invoices are assumed to be in the new package already.
    data: { accountingProvider: provider, acctStartDate: provider ? new Date() : before.acctStartDate, acctLastError: "" },
  });
  redirect(toSettings("msg", provider ? `${adapter(provider)!.name} chosen. Now connect it below.` : "Accounting link switched off. Nothing was changed in the package."));
}

/** Username/password or API-key packages (Sage, Odoo). */
export async function saveAccountingLogin(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const a = apiAdapter(s.accountingProvider);
  if (!a || a.auth !== "login" || !a.loginFields) redirect(toSettings("err", "Choose a package that signs in with a login first."));
  if (!a.configured()) redirect(toSettings("err", `${a.name} is not set up on the server yet (${a.envVars.filter((v) => v.required).map((v) => v.name).join(", ")}).`));
  const before = await loadLink(db, a.id);
  const creds: Record<string, string> = {};
  for (const f of a.loginFields) {
    const typed = String(fd.get(f.name) ?? "").trim();
    const value = typed || (f.secret ? (before?.credentials[f.name] ?? "") : "");
    if (!value) redirect(toSettings("err", `Enter the ${f.label.toLowerCase()}.`));
    creds[f.name] = value;
  }
  try {
    await a.verifyLogin?.(creds);
  } catch (e) {
    redirect(toSettings("err", why(e)));
  }
  await saveLink(db, a.id, { credentials: creds });
  // Only one organisation: pick it.
  let picked = "";
  if (a.needsOrg && !before?.orgId) {
    try {
      const orgs = await a.organisations(await ctxFor(db, a.id));
      if (orgs?.length === 1) {
        await saveLink(db, a.id, { orgId: orgs[0].id, orgName: orgs[0].name });
        picked = ` Company: ${orgs[0].name}.`;
      }
    } catch {
      // chosen on the next screen
    }
  }
  redirect(toSettings("msg", `Signed in to ${shortName(a.id)}.${picked} Now check the choices below and save.`));
}

export async function chooseAccountingOrganisation(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const a = apiAdapter(s.accountingProvider);
  if (!a) redirect(toSettings("err", "Choose the accounting package first."));
  const [orgId, ...name] = str(fd, "org").split("|");
  if (!orgId) redirect(toSettings("err", "Choose the organisation."));
  const before = await loadLink(db, a.id);
  // Another organisation has its own tax types and accounts: choose them again.
  await saveLink(db, a.id, { orgId, orgName: name.join("|"), ...(before?.orgId && before.orgId !== orgId ? { config: {} } : {}) });
  redirect(toSettings("msg", "Organisation chosen. Now choose the tax types and accounts."));
}

/** Tax types, accounts, start date, auto-send, numbering. Fields named cfg_<key>. */
export async function saveAccountingOptions(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const a = adapter(s.accountingProvider);
  if (!a) redirect(toSettings("err", "Choose the accounting package first."));
  const before = await loadLink(db, a.id);
  const config: Record<string, string> = { ...(before?.config ?? {}) };
  for (const [k, v] of fd.entries()) if (k.startsWith("cfg_")) config[k.slice(4)] = String(v).trim();
  const start = fromLocalInput(str(fd, "acctStartDate"));
  await saveLink(db, a.id, { config });
  await db.settings.update({
    where: { id: 1 },
    data: {
      acctAutoSend: fd.get("acctAutoSend") === "on",
      acctUseKuduNumbers: fd.get("acctUseKuduNumbers") === "on",
      ...(start ? { acctStartDate: start } : {}),
    },
  });
  redirect(toSettings("msg", `${shortName(a.id)} settings saved.`));
}

export async function disconnectAccounting() {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  if (s.accountingProvider) await saveLink(db, s.accountingProvider as never, { credentials: null });
  redirect(toSettings("msg", `${shortName(s.accountingProvider)} disconnected. Nothing was changed there; your choices are kept for reconnecting.`));
}

/** "Send to <package>" on an invoice: sends (or updates) it, then any payments not yet sent. */
export async function sendInvoiceToAccountingNow(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.edit");
  const id = str(fd, "id");
  let text = "";
  try {
    const r = await sendInvoice(db, id);
    const inv = await db.invoice.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    const pending = inv.payments.filter((p) => !p.fromAccounting && !(p.acctId && p.acctLink === inv.acctLink));
    let failed = 0;
    for (const p of pending) await sendPayment(db, p.id).catch(() => failed++);
    text = `Sent to ${r.who} as ${r.number}.${pending.length ? ` ${pending.length - failed} of ${pending.length} payment(s) sent.` : ""}`;
  } catch (e) {
    redirect(`/invoices/${id}?err=${enc(why(e))}`);
  }
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?msg=${enc(text)}`);
}

/** "Check for payments": on one invoice (id given) or across open invoices (Settings). */
export async function checkAccountingPayments(fd: FormData) {
  const db = await tenantDb();
  const id = str(fd, "id");
  await requirePermission(id ? "invoices.view" : "settings.manage");
  const back = id ? `/invoices/${id}` : "/settings";
  const hash = id ? "" : "#accounting";
  let text = "";
  try {
    const r = await pullPayments(db, id ? { invoiceIds: [id] } : {});
    const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    text = r.added
      ? `${r.added} payment${r.added === 1 ? "" : "s"} of ${money(r.amount, s.currencySymbol)} brought in from ${r.who} (${r.checked} invoice${r.checked === 1 ? "" : "s"} checked).`
      : `No new payments in ${r.who} (${r.checked} open invoice${r.checked === 1 ? "" : "s"} checked).`;
  } catch (e) {
    await db.settings.update({ where: { id: 1 }, data: { acctLastError: why(e).slice(0, 500) } }).catch(() => undefined);
    redirect(`${back}?err=${enc(why(e))}${hash}`);
  }
  revalidatePath(back);
  redirect(`${back}?msg=${enc(text)}${hash}`);
}

/** Pastel: upload a receipts CSV exported from Pastel/Evolution. */
export async function importPastelReceipts(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) redirect(toSettings("err", "Choose the CSV file exported from Pastel."));
  if (file.size > 5_000_000) redirect(toSettings("err", "That file is too big (over 5 MB)."));
  let text = "";
  try {
    const r = await importReceipts(db, await file.text());
    const s = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
    const skipped = r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.slice(0, 5).join("; ")}${r.skipped.length > 5 ? "…" : ""}` : "";
    text = `${r.rows} row(s) read, ${r.added} payment(s) of ${money(r.amount, s.currencySymbol)} added.${skipped}`;
  } catch (e) {
    redirect(toSettings("err", why(e)));
  }
  revalidatePath("/invoices");
  redirect(toSettings("msg", text));
}
