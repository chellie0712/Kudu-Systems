"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { authDisabled, requireUser } from "@/auth";
import { db } from "@/lib/db";
import { num, str } from "@/lib/form";
import { getSettings } from "@/lib/settings";

export async function saveSettings(fd: FormData) {
  await requireUser();
  await getSettings();
  const textFields = [
    "companyName", "tagline", "email", "phone", "website", "address", "vatNumber", "regNumber",
    "currency", "currencySymbol", "bankName", "bankAccountName", "bankAccountNumber", "bankBranchCode",
    "quoteTerms", "invoiceTerms", "quotePrefix", "jobCardPrefix", "invoicePrefix", "googleCalendarId",
    "jobCardTitle", "jobCardSubtitle", "pcoNumber", "warrantyCovers", "warrantyTerms",
  ] as const;
  const data: Record<string, string | number | null> = {};
  for (const f of textFields) data[f] = str(fd, f);
  data.vatRate = num(fd, "vatRate", 15);
  data.quoteValidityDays = Math.round(num(fd, "quoteValidityDays", 30));
  data.invoiceDueDays = Math.round(num(fd, "invoiceDueDays", 30));
  data.warrantyMonths = Math.round(num(fd, "warrantyMonths", 3));
  data.pcoSignature = str(fd, "pcoSignature") || null;
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
  const user = await requireUser();
  if (authDisabled) redirect("/settings?err=Sign+in+with+Google+first+(demo+mode+has+no+Google+account)");
  const account = await db.account.findFirst({ where: { userId: user.id, provider: "google" } });
  if (!account?.refresh_token) {
    redirect("/settings?err=No+Google+calendar+permission+on+this+account.+Sign+out+and+sign+in+again,+approving+calendar+access.");
  }
  await db.settings.update({ where: { id: 1 }, data: { googleSyncUserId: user.id, googleSyncToken: null } });
  redirect("/settings?msg=Calendar+sync+connected+to+your+Google+account");
}

export async function disconnectGoogleCalendar() {
  await requireUser();
  await db.settings.update({ where: { id: 1 }, data: { googleSyncUserId: null, googleSyncToken: null } });
  redirect("/settings?msg=Google+Calendar+sync+disconnected");
}

export async function saveProduct(fd: FormData) {
  await requireUser();
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
  await requireUser();
  // Job cards keep a text copy of each product, so deleting never changes past job cards.
  await db.product.delete({ where: { id: str(fd, "id") } });
  redirect("/settings?msg=Product+deleted#products");
}
