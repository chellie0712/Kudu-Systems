import Link from "next/link";
import { QueryStatus, type Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { docBranchWhere } from "@/lib/branch";
import { OPEN_STATUSES, overdueBefore, QUERY_STATUS_LABELS } from "@/lib/queries";
import { Flash, PageHeader } from "@/components/ui";
import { QueryTable } from "@/components/Queries";

export const metadata = { title: "Queries" };

const VIEWS = [
  { key: "open", label: "Open" },
  { key: "mine", label: "Assigned to me" },
  { key: "overdue", label: "Overdue" },
  { key: "unassigned", label: "Unassigned" },
  { key: "all", label: "All" },
];

export default async function QueriesPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string; msg?: string }> }) {
  const user = await requirePermission("queries.view");
  const db = await tenantDb();
  const { view = "open", status, q = "", msg } = await searchParams;
  const open = { status: { in: OPEN_STATUSES } };
  const byView: Record<string, Prisma.QueryWhereInput> = {
    open,
    mine: { ...open, assignedToId: user.id },
    overdue: { ...open, dueAt: { lt: overdueBefore() } },
    unassigned: { ...open, assignedToId: null },
    all: {},
  };
  const rows = await db.query.findMany({
    where: {
      ...(await docBranchWhere()),
      ...(byView[view] ?? open),
      ...(status && status in QueryStatus ? { status: status as QueryStatus } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { subject: { contains: q, mode: "insensitive" } },
              { category: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { id: true, name: true } }, assignedTo: { select: { name: true, email: true } } },
    // Urgent first, then by due date, newest first.
    orderBy: [{ priority: "desc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: 300,
  });

  return (
    <div>
      <PageHeader
        title="Queries"
        subtitle="Customer complaints, requests and callbacks, tracked until resolved."
        actions={<Link href="/queries/new" className="btn-primary">+ Log query</Link>}
      />
      <Flash message={msg} />
      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/queries?view=${v.key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${view === v.key ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200 hover:text-kudu-600"}`}
          >
            {v.label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={q} placeholder="Search number, subject, type or customer" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ""} className="input w-auto">
          <option value="">Any status</option>
          {(Object.keys(QUERY_STATUS_LABELS) as QueryStatus[]).map((s) => <option key={s} value={s}>{QUERY_STATUS_LABELS[s]}</option>)}
        </select>
        <button className="btn-dark">Filter</button>
        {(status || q) && <Link href={`/queries?view=${view}`} className="text-sm text-charcoal-500 hover:text-kudu-600">Clear</Link>}
      </form>
      <div className="card overflow-x-auto">
        <QueryTable rows={rows} />
      </div>
    </div>
  );
}
