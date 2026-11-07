import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { QUERY_STATUS_COLOURS, QUERY_STATUS_LABELS } from "@/lib/queries";
import { Empty } from "@/components/ui";
import { PortalNotice } from "@/components/Portal";

export const metadata = { title: "Queries" };

/** The customer's queries with their status and how they were resolved; internal notes are not shown. */
export default async function PortalQueries({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const { msg } = await searchParams;
  const rows = await db.query.findMany({
    where: { customerId: user.customerId },
    orderBy: { createdAt: "desc" },
    select: { id: true, number: true, subject: true, category: true, status: true, createdAt: true, resolution: true, resolvedAt: true, jobCard: { select: { number: true } } },
  });
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Queries</h1>
        <Link href="/portal/queries/new" className="btn-primary">New query</Link>
      </div>
      <PortalNotice msg={msg} />
      <div className="card divide-y divide-charcoal-100">
        {rows.length === 0 && <Empty>No queries yet.</Empty>}
        {rows.map((q) => (
          <div key={q.id} className="p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{q.number} · {q.subject}</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${QUERY_STATUS_COLOURS[q.status]}`}>{QUERY_STATUS_LABELS[q.status]}</span>
            </div>
            <div className="text-xs text-charcoal-500">{[fmtDate(q.createdAt), q.category, q.jobCard && `about ${q.jobCard.number}`].filter(Boolean).join(" · ")}</div>
            {q.resolution && <p className="mt-2 rounded-md bg-emerald-50 p-2 text-emerald-900">{q.resolution}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
