import { NextResponse } from "next/server";
import { platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { escalateOverdue } from "@/lib/tasks";

export const maxDuration = 300;

/**
 * Daily job (vercel.json): escalates overdue tasks in every company, so escalation happens even on
 * days nobody opens Kudu. Pages also do this on load. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const companies = await platformDb.company.findMany({ where: { active: true } });
  const results: { company: string; escalated: number; error?: string }[] = [];
  for (const company of companies) {
    try {
      const db = clientForCompany(company);
      const settings = await db.settings.findUnique({ where: { id: 1 } });
      results.push({ company: company.slug, escalated: settings ? await escalateOverdue(db, settings) : 0 });
    } catch (e) {
      results.push({ company: company.slug, escalated: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return NextResponse.json({ results });
}
