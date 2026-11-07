"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { fromLocalInput } from "@/lib/format";
import { SageError, pullPaymentsFromSage, sageCompanies, sageConfigured, sendInvoiceToSage, sendPaymentToSage } from "@/lib/sage";
import { money } from "@/lib/format";

const enc = encodeURIComponent;
const toSettings = (key: "msg" | "err", text: string) => `/settings?${key}=${enc(text)}#sage`;
const intOrNull = (v: string) => (/^\d+$/.test(v) ? Number(v) : null);

/** Saves the Sage user Kudu signs in as, and checks it by listing the companies it can see. */
export async function saveSageLogin(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  if (!sageConfigured()) redirect(toSettings("err", "Sage is not set up on the server yet (SAGE_API_KEY)."));
  const before = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const username = str(fd, "sageUsername");
  const typed = String(fd.get("sagePassword") ?? "");
  if (!username) redirect(toSettings("err", "Enter the Sage username (the email the Sage user signs in with)."));
  if (!typed && !before.sagePassword) redirect(toSettings("err", "Enter the Sage password."));
  const password = typed || decryptSecret(before.sagePassword!);
  let companies: { id: number; name: string }[] = [];
  try {
    companies = await sageCompanies({ username, password });
  } catch (e) {
    redirect(toSettings("err", (e as Error).message));
  }
  if (companies.length === 0) redirect(toSettings("err", "That Sage user signed in, but can't see any companies."));
  const only = companies.length === 1 ? companies[0] : null;
  await db.settings.update({
    where: { id: 1 },
    data: {
      sageUsername: username,
      sagePassword: encryptSecret(password),
      sageLastError: "",
      ...(only && !before.sageCompanyId ? { sageCompanyId: only.id, sageCompanyName: only.name } : {}),
      ...(before.sageStartDate ? {} : { sageStartDate: new Date() }),
    },
  });
  redirect(toSettings("msg", `Signed in to Sage. ${only ? `Company: ${only.name}.` : "Now choose the company."} Then choose the VAT type, item and bank account.`));
}

/** Company, VAT type, item, bank account and sending options. */
export async function saveSageOptions(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const before = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const [companyId, companyName] = str(fd, "company").split("|");
  const newCompany = intOrNull(companyId);
  const changedCompany = newCompany !== before.sageCompanyId;
  const [itemId, itemName] = str(fd, "item").split("|");
  const start = fromLocalInput(str(fd, "sageStartDate"));
  await db.settings.update({
    where: { id: 1 },
    data: changedCompany
      ? // A different company has its own tax types, items and customers: choose again.
        { sageCompanyId: newCompany, sageCompanyName: companyName ?? "", sageTaxTypeId: null, sageZeroTaxTypeId: null, sageItemId: null, sageItemName: "", sageBankAccountId: null }
      : {
          sageTaxTypeId: intOrNull(str(fd, "taxType")),
          sageZeroTaxTypeId: intOrNull(str(fd, "zeroTaxType")),
          sageItemId: intOrNull(itemId),
          sageItemName: itemName ?? "",
          sageBankAccountId: intOrNull(str(fd, "bankAccount")),
          sageUseKuduNumbers: fd.get("sageUseKuduNumbers") === "on",
          sageAutoSend: fd.get("sageAutoSend") === "on",
          ...(start ? { sageStartDate: start } : {}),
        },
  });
  if (changedCompany) {
    // Customer IDs belong to the old company; they are created again in the new one.
    await db.customer.updateMany({ where: { sageId: { not: null } }, data: { sageId: null } });
    redirect(toSettings("msg", "Sage company chosen. Now choose its VAT type, item and bank account."));
  }
  redirect(toSettings("msg", "Sage settings saved."));
}

export async function disconnectSage() {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  await db.settings.update({ where: { id: 1 }, data: { sagePassword: null, sageLastError: "" } });
  redirect(toSettings("msg", "Sage disconnected. Nothing was changed in Sage."));
}

/** "Send to Sage" on an invoice: sends (or updates) it, then any payments not yet in Sage. */
export async function sendInvoiceToSageNow(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.edit");
  const id = str(fd, "id");
  let msg = "";
  try {
    const r = await sendInvoiceToSage(db, id);
    const pending = await db.payment.findMany({ where: { invoiceId: id, sageId: null, fromSage: false } });
    let failed = 0;
    for (const p of pending) await sendPaymentToSage(db, p.id).catch(() => failed++);
    msg = `Sent to Sage as ${r.sageNumber}.${pending.length ? ` ${pending.length - failed} of ${pending.length} payment(s) sent.` : ""}`;
  } catch (e) {
    redirect(`/invoices/${id}?err=${enc(e instanceof SageError ? e.message : String(e))}`);
  }
  revalidatePath(`/invoices/${id}`);
  redirect(`/invoices/${id}?msg=${enc(msg)}`);
}

/** "Check Sage for payments": on one invoice (id given) or across open invoices (Settings). */
export async function checkSagePayments(fd: FormData) {
  const db = await tenantDb();
  const id = str(fd, "id");
  await requirePermission(id ? "invoices.view" : "settings.manage");
  const back = id ? `/invoices/${id}` : "/settings";
  const hash = id ? "" : "#sage";
  let msg = "";
  try {
    const r = await pullPaymentsFromSage(db, id ? { invoiceIds: [id] } : { limit: 90 });
    const s = await db.settings.update({ where: { id: 1 }, data: { sageLastError: "" } });
    msg = r.added
      ? `${r.added} payment${r.added === 1 ? "" : "s"} of ${money(r.amount, s.currencySymbol)} brought in from Sage (${r.checked} invoice${r.checked === 1 ? "" : "s"} checked).`
      : `No new payments in Sage (${r.checked} open invoice${r.checked === 1 ? "" : "s"} checked).`;
  } catch (e) {
    redirect(`${back}?err=${enc(e instanceof SageError ? e.message : String(e))}${hash}`);
  }
  revalidatePath(back);
  redirect(`${back}?msg=${enc(msg)}${hash}`);
}
