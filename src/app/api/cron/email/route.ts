import { NextResponse } from "next/server";
import { platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { sendCampaignBatch } from "@/lib/email/sender";

export const maxDuration = 300;

/**
 * Daily job (vercel.json): carries on with campaigns that are still sending, e.g. ones that hit a
 * mailbox's daily limit yesterday, or that nobody kept open. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new NextResponse("Unauthorized", { status: 401 });
  const deadline = Date.now() + 270_000;
  const companies = await platformDb.company.findMany({ where: { active: true } });
  const results: { company: string; campaign: string; state: string; sent: number; queued: number; message: string }[] = [];
  for (const company of companies) {
    const db = clientForCompany(company);
    const sending = await db.emailCampaign.findMany({ where: { status: "SENDING" }, select: { id: true, name: true }, orderBy: { startedAt: "asc" } }).catch(() => []);
    for (const c of sending) {
      const budget = deadline - Date.now();
      if (budget < 20_000) break;
      try {
        const r = await sendCampaignBatch(db, company, c.id, Math.min(budget, 120_000));
        results.push({ company: company.slug, campaign: c.name, state: r.state, sent: r.sent, queued: r.queued, message: r.message });
      } catch (e) {
        results.push({ company: company.slug, campaign: c.name, state: "error", sent: 0, queued: -1, message: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  return NextResponse.json({ results });
}
