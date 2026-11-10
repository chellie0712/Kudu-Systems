import { NextResponse } from "next/server";
import { platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { dailyWorkflows } from "@/lib/workflows/engine";

export const maxDuration = 300;

/**
 * Daily job (vercel.json): in every company, starts timed workflows (overdue invoices, quotations
 * with no answer, jobs coming up...), finishes waits that are due and clears old history.
 * Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const companies = await platformDb.company.findMany({ where: { active: true } });
  const results: { company: string; started?: number; finished?: number; error?: string }[] = [];
  for (const company of companies) {
    try {
      const db = clientForCompany(company);
      if (!(await db.settings.findUnique({ where: { id: 1 }, select: { id: true } }))) continue;
      results.push({ company: company.slug, ...(await dailyWorkflows(db)) });
    } catch (e) {
      results.push({ company: company.slug, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
