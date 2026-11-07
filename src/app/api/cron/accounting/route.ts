import { NextResponse } from "next/server";
import { platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { activeLink, pullPayments } from "@/lib/accounting/sync";

/**
 * Nightly job (vercel.json): for every company linked to an online accounting package, brings
 * payments captured there onto the matching Kudu invoices. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const companies = await platformDb.company.findMany({ where: { active: true } });
  const results: { company: string; provider: string; ok: boolean; detail: string }[] = [];
  for (const company of companies) {
    const db = clientForCompany(company);
    const a = await activeLink(db).catch(() => null);
    if (!a) continue;
    try {
      const r = await pullPayments(db);
      results.push({ company: company.slug, provider: a.adapter.id, ok: true, detail: `${r.checked} checked, ${r.added} payments added` });
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      await db.settings.update({ where: { id: 1 }, data: { acctLastError: detail.slice(0, 500) } }).catch(() => undefined);
      results.push({ company: company.slug, provider: a.adapter.id, ok: false, detail });
    }
  }
  return NextResponse.json({ synced: results });
}
