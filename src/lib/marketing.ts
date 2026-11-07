import type { PrismaClient } from "@prisma/client";

// Lead sources and expense categories. Plain text in the database, so these lists can grow.

export const GOOGLE_ADS = "Google Ads";

export const LEAD_SOURCES = [GOOGLE_ADS, "Facebook / Instagram", "Website (not an ad)", "Google search / Maps", "Referral", "Repeat customer", "Walk-in / signage", "Other"] as const;

export const EXPENSE_CATEGORIES = [
  "Wages & salaries",
  "Fuel",
  "Vehicle costs",
  "Chemicals & materials bought",
  "Equipment",
  "Other advertising",
  "Rent & utilities",
  "Phone & internet",
  "Insurance",
  "Bank charges",
  "Professional fees",
  "Other",
] as const;

/** Campaign names are matched loosely: case and spacing don't matter. */
export const campaignKey = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Campaign names seen in ad spend, newest first, for the customer form's suggestions. */
export async function adCampaignNames(db: Pick<PrismaClient, "adSpend">): Promise<string[]> {
  const rows = await db.adSpend.groupBy({ by: ["campaign"], _max: { date: true }, orderBy: { _max: { date: "desc" } }, take: 200 });
  return rows.map((r) => r.campaign);
}
