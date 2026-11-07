"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { num, str } from "@/lib/form";
import { fromLocalInput, toCents } from "@/lib/format";
import { cleanCustomerId, syncGoogleAds } from "@/lib/googleAds";
import { GOOGLE_ADS } from "@/lib/marketing";

const enc = encodeURIComponent;

/** Only same-site paths, so a form can't bounce the user elsewhere. */
const backTo = (fd: FormData, fallback: string) => {
  const b = str(fd, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
};
const withMsg = (path: string, key: "msg" | "err", text: string) => {
  const [p, hash] = path.split("#");
  return `${p}${p.includes("?") ? "&" : "?"}${key}=${enc(text)}${hash ? `#${hash}` : ""}`;
};

// ---------- Google Ads connection (per company) ----------

export async function saveGoogleAdsAccount(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const id = cleanCustomerId(str(fd, "googleAdsCustomerId"));
  if (id && id.length !== 10) redirect(`/settings?err=${enc("A Google Ads account number has 10 digits, like 123-456-7890.")}#google-ads`);
  const before = await db.settings.findUnique({ where: { id: 1 } });
  const changed = before?.googleAdsCustomerId !== id;
  await db.settings.update({
    where: { id: 1 },
    // A different account starts a fresh 13-month pull, which replaces Google Ads spend in that window.
    data: { googleAdsCustomerId: id, ...(changed ? { googleAdsLastSyncAt: null, googleAdsLastError: "" } : {}) },
  });
  if (!id || !before?.googleAdsRefreshToken) redirect(`/settings?msg=${enc("Google Ads account number saved.")}#google-ads`);
  let result = "";
  try {
    const r = await syncGoogleAds(db);
    result = `Google Ads account saved. ${r.rows} campaign-days of spend loaded.`;
  } catch (e) {
    redirect(`/settings?err=${enc(`Saved, but the sync failed: ${(e as Error).message}`)}#google-ads`);
  }
  revalidatePath("/marketing");
  redirect(`/settings?msg=${enc(result)}#google-ads`);
}

export async function syncGoogleAdsNow(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("reports.view");
  const back = backTo(fd, "/marketing");
  let result = "";
  try {
    const r = await syncGoogleAds(db);
    result = `Google Ads synced: ${r.rows} campaign-days from ${r.from} to ${r.to}.`;
  } catch (e) {
    redirect(withMsg(back, "err", (e as Error).message));
  }
  revalidatePath("/marketing");
  redirect(withMsg(back, "msg", result));
}

export async function disconnectGoogleAds() {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  // Spend already pulled stays, so past reports don't change.
  await db.settings.update({
    where: { id: 1 },
    data: { googleAdsRefreshToken: null, googleAdsAccountEmail: "", googleAdsLastError: "" },
  });
  redirect(`/settings?msg=${enc("Google Ads disconnected. Spend already loaded is kept.")}#google-ads`);
}

// ---------- Hand-entered ad spend (channels without a live link, e.g. Facebook) ----------

export async function saveAdSpend(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("expenses.manage");
  const back = backTo(fd, "/expenses#ad-spend");
  const channel = str(fd, "channel");
  const campaign = str(fd, "campaign") || channel;
  const date = fromLocalInput(str(fd, "date"));
  const cost = Math.max(0, toCents(str(fd, "cost")));
  if (!channel || !date || !cost) redirect(withMsg(back, "err", "Ad spend needs a channel, a date and an amount."));
  if (channel === GOOGLE_ADS) redirect(withMsg(back, "err", "Google Ads spend comes from the live link. Enter other channels here."));
  // Stored per day at 00:00 UTC like synced spend.
  const day = new Date(`${str(fd, "date")}T00:00:00Z`);
  const data = { cost, clicks: Math.max(0, Math.round(num(fd, "clicks", 0))), conversions: Math.max(0, num(fd, "conversions", 0)), campaign };
  await db.adSpend.upsert({
    where: { channel_campaignId_date: { channel, campaignId: campaign.toLowerCase(), date: day } },
    create: { channel, campaignId: campaign.toLowerCase(), date: day, ...data },
    update: data,
  });
  revalidatePath("/marketing");
  redirect(withMsg(back, "msg", "Ad spend saved."));
}

export async function deleteAdSpend(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("expenses.manage");
  const back = backTo(fd, "/expenses#ad-spend");
  await db.adSpend.deleteMany({ where: { id: str(fd, "id"), channel: { not: GOOGLE_ADS } } });
  revalidatePath("/marketing");
  redirect(withMsg(back, "msg", "Ad spend deleted."));
}

// ---------- Expenses ----------

export async function saveExpense(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("expenses.manage");
  const back = backTo(fd, "/expenses");
  const id = str(fd, "id");
  const date = fromLocalInput(str(fd, "date"));
  const data = {
    date: date ?? new Date(),
    category: str(fd, "category").slice(0, 80),
    description: str(fd, "description").slice(0, 500),
    supplier: str(fd, "supplier").slice(0, 200),
    amount: Math.max(0, toCents(str(fd, "amount"))),
  };
  if (!date || !data.category || !data.amount) redirect(withMsg(back, "err", "An expense needs a date, a category and an amount."));
  if (id) await db.expense.update({ where: { id }, data });
  else await db.expense.create({ data: { ...data, createdBy: user.name || user.email } });
  revalidatePath("/marketing");
  redirect(withMsg(back, "msg", "Expense saved."));
}

export async function deleteExpense(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("expenses.manage");
  const back = backTo(fd, "/expenses");
  await db.expense.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/marketing");
  redirect(withMsg(back, "msg", "Expense deleted."));
}
