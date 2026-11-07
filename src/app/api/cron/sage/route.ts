import { NextResponse } from "next/server";
import { platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { pullPaymentsFromSage, sageReady } from "@/lib/sage";

/**
 * Nightly job (vercel.json): for every company linked to Sage, brings payments captured in Sage
 * onto the matching Kudu invoices. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const companies = await platformDb.company.findMany({ where: { active: true } });
  const results: { company: string; ok: boolean; detail: string }[] = [];
  for (const company of companies) {
    const db = clientForCompany(company);
    const s = await db.settings.findUnique({ where: { id: 1 } }).catch(() => null);
    if (!s || !sageReady(s)) continue;
    try {
      const r = await pullPaymentsFromSage(db, { limit: 90 });
      results.push({ company: company.slug, ok: true, detail: `${r.checked} checked, ${r.added} payments added` });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await db.settings.update({ where: { id: 1 }, data: { sageLastError: detail.slice(0, 500) } }).catch(() => undefined);
      results.push({ company: company.slug, ok: false, detail });
    }
  }
  return NextResponse.json({ synced: results });
}
