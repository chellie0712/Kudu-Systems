import { NextResponse } from "next/server";
import { platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { syncGoogleAds } from "@/lib/googleAds";

/**
 * Daily job (vercel.json): refreshes Google Ads spend for every active company that connected
 * its own Google Ads account. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const companies = await platformDb.company.findMany({ where: { active: true } });
  const results: { company: string; ok: boolean; detail: string }[] = [];
  for (const company of companies) {
    const db = clientForCompany(company);
    const s = await db.settings.findUnique({ where: { id: 1 }, select: { googleAdsRefreshToken: true, googleAdsCustomerId: true } }).catch(() => null);
    if (!s?.googleAdsRefreshToken || !s.googleAdsCustomerId) continue;
    try {
      const r = await syncGoogleAds(db);
      results.push({ company: company.slug, ok: true, detail: `${r.rows} rows` });
    } catch (e) {
      results.push({ company: company.slug, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ synced: results });
}
