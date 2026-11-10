"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authDisabled, requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { num, str } from "@/lib/form";
import { getSettings } from "@/lib/settings";
import { parseLogo } from "@/lib/logo";
import { JobCardStatus } from "@prisma/client";
import { STATUS_COLOURS } from "@/lib/jobStatus";
import { toCents } from "@/lib/format";
import { layoutId, parseDocStyle, type DocStyle } from "@/lib/docLayout";

export async function saveSettings(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  await getSettings();
  const textFields = [
    "companyName", "tagline", "email", "phone", "website", "address", "vatNumber", "regNumber",
    "currency", "currencySymbol", "bankName", "bankAccountName", "bankAccountNumber", "bankBranchCode",
    "quoteTerms", "invoiceTerms", "quotePrefix", "jobCardPrefix", "invoicePrefix", "queryPrefix", "googleCalendarId",
    "jobCardTitle", "jobCardSubtitle", "pcoNumber", "warrantyCovers", "warrantyTerms", "labourDescription", "poPrefix",
  ] as const;
  const data: Record<string, string | number | boolean | null> = {};
  for (const f of textFields) data[f] = str(fd, f);
  data.vatRate = num(fd, "vatRate", 15);
  data.quoteValidityDays = Math.round(num(fd, "quoteValidityDays", 30));
  data.invoiceDueDays = Math.round(num(fd, "invoiceDueDays", 30));
  data.warrantyMonths = Math.round(num(fd, "warrantyMonths", 3));
  data.pcoSignature = str(fd, "pcoSignature") || null;
  data.labourRate = Math.max(0, toCents(str(fd, "labourRate")));
  data.invoiceApproval = fd.get("invoiceApproval") === "on";
  data.invoiceApprovalThreshold = Math.max(0, toCents(str(fd, "invoiceApprovalThreshold")));
  data.quoteApproval = fd.get("quoteApproval") === "on";
  data.quoteApprovalThreshold = Math.max(0, toCents(str(fd, "quoteApprovalThreshold")));
  data.poApproval = fd.get("poApproval") === "on";
  data.poApprovalThreshold = Math.max(0, toCents(str(fd, "poApprovalThreshold")));
  data.claimAutoApprove = Math.max(0, toCents(str(fd, "claimAutoApprove")));
  data.annualLeaveDays = Math.max(0, Math.min(365, num(fd, "annualLeaveDays", 15)));
  data.poPrefix = String(data.poPrefix || "PO-");
  data.labourRoundMinutes = Math.max(0, Math.min(60, Math.round(num(fd, "labourRoundMinutes", 15))));
  try {
    data.logo = parseLogo(str(fd, "logo"));
  } catch (e) {
    redirect(`/settings?err=${encodeURIComponent((e as Error).message)}`);
  }
  const before = await getSettings();
  await db.settings.update({
    where: { id: 1 },
    // Changing calendars invalidates the incremental sync token.
    data: { ...data, ...(data.googleCalendarId !== before.googleCalendarId ? { googleSyncToken: null } : {}) },
  });
  revalidatePath("/", "layout");
  redirect("/settings?msg=Settings+saved");
}

/** Make the signed-in user's Google account the one the calendar sync runs as. */
export async function useMyGoogleCalendar() {
  const db = await tenantDb();
  const user = await requirePermission("settings.manage");
  if (authDisabled) redirect("/settings?err=Sign+in+with+Google+first+(demo+mode+has+no+Google+account)");
  const account = await db.account.findFirst({ where: { userId: user.id, provider: "google" } });
  if (!account?.refresh_token) {
    redirect("/settings?err=No+Google+calendar+permission+on+this+account.+Sign+out+and+sign+in+again,+approving+calendar+access.");
  }
  await db.settings.update({ where: { id: 1 }, data: { googleSyncUserId: user.id, googleSyncToken: null } });
  redirect("/settings?msg=Calendar+sync+connected+to+your+Google+account");
}

export async function disconnectGoogleCalendar() {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  await db.settings.update({ where: { id: 1 }, data: { googleSyncUserId: null, googleSyncToken: null } });
  redirect("/settings?msg=Google+Calendar+sync+disconnected");
}

export async function saveProduct(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name"),
    activeIngredient: str(fd, "activeIngredient"),
    regNumber: str(fd, "regNumber"),
    sortOrder: Math.round(num(fd, "sortOrder", 0)),
    active: fd.get("active") === "on",
  };
  if (!data.name) redirect("/settings?err=Product+name+is+required#products");
  if (id) await db.product.update({ where: { id }, data });
  else await db.product.create({ data: { ...data, active: true, sortOrder: (await db.product.count()) } });
  redirect("/settings?msg=Product+saved#products");
}

export async function deleteProduct(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  // Job cards keep a text copy of each product, so deleting never changes past job cards.
  await db.product.delete({ where: { id: str(fd, "id") } });
  redirect("/settings?msg=Product+deleted#products");
}

// ---------- Custom job statuses ----------

/** A "stuck after" number of days from a form: 1 to 365, or null (use the company default). */
function stuckDays(raw: string): number | null {
  const n = Math.round(Number(raw));
  return raw && Number.isFinite(n) ? Math.min(365, Math.max(1, n)) : null;
}

/** When the process monitor flags jobs, quotes and missing invoices (Settings → Job statuses). */
export async function saveMonitorSettings(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const n = (k: string, d: number) => stuckDays(str(fd, k)) ?? d;
  await db.settings.update({
    where: { id: 1 },
    data: { jobStuckDays: n("jobStuckDays", 3), quoteFollowUpDays: n("quoteFollowUpDays", 7), invoiceAfterDays: n("invoiceAfterDays", 2) },
  });
  redirect("/settings?msg=Process+monitor+limits+saved#statuses");
}

export async function saveJobStatus(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const id = str(fd, "id");
  const stage = str(fd, "stage");
  const colour = str(fd, "colour");
  const data = {
    name: str(fd, "name"),
    stage: (stage in JobCardStatus ? stage : "IN_PROGRESS") as JobCardStatus,
    colour: colour in STATUS_COLOURS ? colour : "slate",
    active: id ? fd.get("active") === "on" : true,
    stuckAfterDays: stuckDays(str(fd, "stuckAfterDays")),
  };
  if (!data.name) redirect("/settings?err=Status+name+is+required#statuses");
  if (id) await db.jobStatus.update({ where: { id }, data });
  else await db.jobStatus.create({ data: { ...data, sortOrder: await db.jobStatus.count() } });
  redirect("/settings?msg=Job+status+saved#statuses");
}

export async function deleteJobStatus(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  // Job cards using it fall back to showing their stage (the relation is SET NULL).
  await db.jobStatus.delete({ where: { id: str(fd, "id") } });
  redirect("/settings?msg=Job+status+deleted#statuses");
}

// ---------- Checklist templates ----------

export async function saveChecklistTemplate(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name"),
    items: str(fd, "items")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n"),
    autoAddAll: fd.get("autoAddAll") === "on",
    jobType: str(fd, "jobType"),
    requiredForCompletion: fd.get("requiredForCompletion") === "on",
    active: id ? fd.get("active") === "on" : true,
  };
  if (!data.name || !data.items) redirect("/settings?err=A+checklist+needs+a+name+and+at+least+one+item#checklists");
  if (id) await db.checklistTemplate.update({ where: { id }, data });
  else await db.checklistTemplate.create({ data: { ...data, sortOrder: await db.checklistTemplate.count() } });
  redirect("/settings?msg=Checklist+saved#checklists");
}

export async function deleteChecklistTemplate(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  // Job cards keep their own copy of the checklist.
  await db.checklistTemplate.delete({ where: { id: str(fd, "id") } });
  redirect("/settings?msg=Checklist+deleted#checklists");
}

/** Save the quotation and invoice layouts chosen under Settings → Quote & invoice layout. */
export async function saveDocLayout(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  await getSettings();
  let style: DocStyle;
  try {
    style = parseDocStyle(JSON.parse(str(fd, "docStyle") || "{}"));
  } catch {
    redirect("/settings/layouts?err=The+layout+settings+could+not+be+read.+Please+try+again.");
  }
  await db.settings.update({
    where: { id: 1 },
    data: { quoteLayout: layoutId(str(fd, "quoteLayout")), invoiceLayout: layoutId(str(fd, "invoiceLayout")), docStyle: style },
  });
  revalidatePath("/", "layout");
  redirect("/settings/layouts?msg=Layout+saved.+New+and+existing+quotations+and+invoices+now+print+this+way.");
}
