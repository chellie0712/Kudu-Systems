import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, money } from "@/lib/format";
import { portalQuotes } from "@/lib/portalData";
import { QuoteBadge } from "@/components/Portal";
import { Empty } from "@/components/ui";

export const metadata = { title: "Quotations" };

export default async function PortalQuotations() {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const settings = await getSettings();
  const rows = await db.quotation.findMany({ where: portalQuotes(user.customerId), orderBy: { issueDate: "desc" } });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Quotations</h1>
      <div className="card divide-y divide-charcoal-100">
        {rows.length === 0 && <Empty>No quotations yet.</Empty>}
        {rows.map((q) => (
          <Link key={q.id} href={`/portal/quotations/${q.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-charcoal-50">
            <span>
              <span className="font-semibold">{q.number}</span>{q.title && ` · ${q.title}`}
              <span className="block text-xs text-charcoal-500">{fmtDate(q.issueDate)} · valid until {fmtDate(q.validUntil)}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">{money(q.total, settings.currencySymbol)}</span>
              <QuoteBadge status={q.status} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
