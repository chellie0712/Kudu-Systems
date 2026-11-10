import Link from "next/link";
import { requireUser, type AppUser } from "@/auth";
import { can } from "@/lib/permissions";
import type { TenantDb } from "@/lib/db";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { OfflineAgent } from "@/components/OfflineAgent";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, dayKey, fmtDate, fmtDateTime, money } from "@/lib/format";
import { PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { stockOverview } from "@/lib/inventory";
import { currentBranchId, getBranches } from "@/lib/branch";
import { OPEN_STATUSES, overdueBefore } from "@/lib/queries";
import { openJobs as monitorJobs } from "@/lib/monitor";
import { escalateOverdue, myTaskCounts } from "@/lib/tasks";

/** My open tasks, red when any are overdue, plus overdue tasks escalated to me. Escalates on load. */
async function TasksBanner({ db, user }: { db: TenantDb; user: AppUser }) {
  if (!can(user, "tasks.view")) return null;
  await escalateOverdue(db, await getSettings());
  const t = await myTaskCounts(db, user);
  return (
    <>
      {t.escalated > 0 && (
        <Link href="/tasks?view=escalated" className="mb-4 block rounded-md border border-kudu-200 bg-kudu-50 p-3 text-sm font-medium text-kudu-800 hover:bg-kudu-100">
          {t.escalated} overdue task{t.escalated === 1 ? " was" : "s were"} escalated to you →
        </Link>
      )}
      {t.open > 0 && (
        <Link
          href={t.overdue ? "/tasks?view=overdue" : "/tasks"}
          className={`mb-4 block rounded-md border p-3 text-sm font-medium ${t.overdue ? "border-kudu-200 bg-kudu-50 text-kudu-800 hover:bg-kudu-100" : "border-sky-200 bg-sky-50 text-sky-900 hover:bg-sky-100"}`}
        >
          You have {t.open} open task{t.open === 1 ? "" : "s"}
          {t.overdue ? `, ${t.overdue} overdue` : ""} →
        </Link>
      )}
    </>
  );
}

export default async function Dashboard() {
  const db = await tenantDb();
  const user = await requireUser();
  if (!can(user, "dashboard.money")) return <TechnicianHome user={user} db={db} />;
  const settings = await getSettings();
  const sym = settings.currencySymbol;
  const now = new Date();
  // Filter everything to the branch chosen in the header.
  const branchId = await currentBranchId();
  const ofBranch = branchId ? { customer: { branchId } } : {};
  const branchName = branchId ? (await getBranches()).find((b) => b.id === branchId)?.name : null;

  const [customerCount, openQuotes, openJobs, unpaid, upcoming, recentQuotes, overdue] = await Promise.all([
    db.customer.count({ where: { archived: false, ...(branchId ? { branchId } : {}) } }),
    db.quotation.aggregate({ where: { status: { in: ["DRAFT", "SENT"] }, ...ofBranch }, _count: true, _sum: { total: true } }),
    db.jobCard.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...ofBranch } }),
    db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, ...ofBranch }, select: { total: true, amountPaid: true, dueDate: true } }),
    db.calendarEvent.findMany({
      where: { end: { gte: now }, start: { lte: addDays(now, 14) }, ...(branchId ? { OR: [{ customerId: null }, { customer: { branchId } }] } : {}) },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { start: "asc" },
      take: 10,
    }),
    db.quotation.findMany({ where: ofBranch, include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: now }, ...ofBranch },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
  ]);
  const outstanding = unpaid.reduce((s, i) => s + i.total - i.amountPaid, 0);
  const overdueTotal = unpaid.filter((i) => i.dueDate < now).reduce((s, i) => s + i.total - i.amountPaid, 0);

  const awaitingApproval =
    settings.invoiceApproval && can(user, "invoices.approve")
      ? await db.invoice.count({ where: { approvalRequestedAt: { not: null }, approvedAt: null, status: { not: "CANCELLED" }, ...ofBranch } })
      : 0;
  const queryCounts = can(user, "queries.view")
    ? await Promise.all([
        db.query.count({ where: { status: { in: OPEN_STATUSES }, ...ofBranch } }),
        db.query.count({ where: { status: { in: OPEN_STATUSES }, dueAt: { lt: overdueBefore(now) }, ...ofBranch } }),
        db.query.count({ where: { status: { in: OPEN_STATUSES }, assignedToId: user.id } }),
      ])
    : null;
  // Quotes the customer accepted in the portal that nobody has turned into work yet.
  const acceptedOnline = can(user, "quotations.view")
    ? await db.quotation.findMany({
        where: { response: "ACCEPTED", status: "ACCEPTED", respondedAt: { gte: addDays(now, -60) }, jobCards: { none: {} }, invoices: { none: {} }, ...ofBranch },
        include: { customer: { select: { name: true } } },
        orderBy: { respondedAt: "asc" },
        take: 5,
      })
    : [];
  const stuckJobs = can(user, "reports.view") && can(user, "jobcards.viewAll") ? (await monitorJobs(db, settings, branchId, now)).filter((j) => j.stuck).length : 0;
  const lowStock = can(user, "inventory.view") ? (await stockOverview(db)).filter((i) => i.low) : [];
  const stats = [
    { label: "Active customers", value: String(customerCount), href: "/customers" },
    { label: "Open quotations", value: `${openQuotes._count} · ${money(openQuotes._sum.total ?? 0, sym)}`, href: "/quotations?status=SENT" },
    { label: "Open job cards", value: String(openJobs), href: "/job-cards?status=SCHEDULED" },
    { label: "Outstanding", value: money(outstanding, sym), sub: overdueTotal ? `${money(overdueTotal, sym)} overdue` : undefined, href: "/invoices?status=OVERDUE" },
  ];

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={[fmtDate(now), branchName && `${branchName} branch`].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href="/customers/new" className="btn-outline">+ Customer</Link>
            <Link href="/quotations/new" className="btn-primary">+ Quotation</Link>
          </>
        }
      />
      {awaitingApproval > 0 && (
        <Link href="/invoices?status=AWAITING_APPROVAL" className="mb-4 block rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 hover:bg-amber-100">
          {awaitingApproval} invoice{awaitingApproval === 1 ? " is" : "s are"} waiting for your approval →
        </Link>
      )}
      <TasksBanner db={db} user={user} />
      {stuckJobs > 0 && (
        <Link href="/monitor#stuck" className="mb-4 block rounded-md border border-kudu-200 bg-kudu-50 p-3 text-sm font-medium text-kudu-800 hover:bg-kudu-100">
          {stuckJobs} job{stuckJobs === 1 ? " looks" : "s look"} stuck. See the process monitor →
        </Link>
      )}
      {acceptedOnline.length > 0 && (
        <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <span className="font-semibold">Accepted online, not booked yet:</span>{" "}
          {acceptedOnline.map((q, i) => (
            <span key={q.id}>
              {i > 0 && ", "}
              <Link href={`/quotations/${q.id}`} className="font-medium underline">{q.number} {q.customer.name}</Link>
            </span>
          ))}
        </div>
      )}
      {queryCounts && queryCounts[0] > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-charcoal-200 bg-white p-3 text-sm">
          <Link href="/queries?view=open" className="font-medium hover:text-kudu-600">{queryCounts[0]} open quer{queryCounts[0] === 1 ? "y" : "ies"}</Link>
          {queryCounts[1] > 0 && <Link href="/queries?view=overdue" className="font-semibold text-kudu-700 hover:underline">{queryCounts[1]} overdue</Link>}
          {queryCounts[2] > 0 && <Link href="/queries?view=mine" className="text-charcoal-600 hover:text-kudu-600">{queryCounts[2]} assigned to you</Link>}
        </div>
      )}
      {lowStock.length > 0 && (
        <Link href="/inventory?show=low" className="mb-4 block rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900 hover:bg-amber-100">
          Low stock: {lowStock.slice(0, 5).map((i) => i.name).join(", ")}
          {lowStock.length > 5 && ` and ${lowStock.length - 5} more`} →
        </Link>
      )}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="card border-l-4 border-l-kudu-600 p-5 hover:shadow-md">
            <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">{s.label}</div>
            <div className="mt-1 text-2xl font-bold">{s.value}</div>
            {s.sub && <div className="mt-1 text-sm font-medium text-kudu-600">{s.sub}</div>}
          </Link>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5">
          <SectionTitle>Next 14 days</SectionTitle>
          {upcoming.length === 0 ? (
            <p className="text-sm text-charcoal-500">Nothing scheduled.</p>
          ) : (
            <ul className="divide-y divide-charcoal-100 text-sm">
              {upcoming.map((e) => (
                <li key={e.id} className="flex justify-between gap-3 py-2">
                  <div>
                    <Link href={e.jobCardId ? `/job-cards/${e.jobCardId}` : `/calendar/${e.id}`} className="font-medium hover:text-kudu-600">{e.title}</Link>
                    {e.customer && <div className="text-xs text-charcoal-500">{e.customer.name}</div>}
                  </div>
                  <span className="shrink-0 text-charcoal-500">{e.allDay ? fmtDate(e.start) : fmtDateTime(e.start)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5">
          <SectionTitle>Overdue invoices</SectionTitle>
          {overdue.length === 0 ? (
            <p className="text-sm text-charcoal-500">None. 👍</p>
          ) : (
            <ul className="divide-y divide-charcoal-100 text-sm">
              {overdue.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 py-2">
                  <div>
                    <Link href={`/invoices/${i.id}`} className="font-medium text-kudu-600 hover:underline">{i.number}</Link>
                    <span className="ml-2 text-charcoal-500">{i.customer.name}</span>
                    <div className="text-xs text-charcoal-500">Due {fmtDate(i.dueDate)}</div>
                  </div>
                  <span className="font-semibold tabular-nums">{money(i.total - i.amountPaid, sym)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-5 lg:col-span-2">
          <SectionTitle>Recent quotations</SectionTitle>
          {recentQuotes.length === 0 ? (
            <p className="text-sm text-charcoal-500">No quotations yet.</p>
          ) : (
            <ul className="divide-y divide-charcoal-100 text-sm">
              {recentQuotes.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-3 py-2">
                  <div>
                    <Link href={`/quotations/${q.id}`} className="font-medium text-kudu-600 hover:underline">{q.number}</Link>
                    <span className="ml-2">{q.customer.name}</span>
                    {q.title && <span className="ml-2 text-charcoal-500">· {q.title}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={q.status} />
                    <span className="tabular-nums">{money(q.total, sym)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** A technician's home page: their open jobs, soonest first. No prices. */
async function TechnicianHome({ user, db }: { user: AppUser; db: TenantDb }) {
  const now = new Date();
  const [open, done] = await Promise.all([
    db.jobCard.findMany({
      where: { technicianId: user.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      include: { customer: { select: { id: true, name: true } }, customStatus: { select: { name: true, colour: true } } },
      orderBy: [{ scheduledStart: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      take: 50,
    }),
    db.jobCard.count({ where: { technicianId: user.id, status: "COMPLETED", updatedAt: { gte: addDays(now, -7) } } }),
  ]);
  return (
    <div>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        subtitle={fmtDate(now)}
        actions={<Link href="/calendar" className="btn-outline">My calendar</Link>}
      />
      <TasksBanner db={db} user={user} />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Link href="/job-cards" className="card border-l-4 border-l-kudu-600 p-5 hover:shadow-md">
          <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">My open jobs</div>
          <div className="mt-1 text-2xl font-bold">{open.length}</div>
        </Link>
        <Link href="/job-cards?status=COMPLETED" className="card border-l-4 border-l-kudu-600 p-5 hover:shadow-md">
          <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">Completed in the last 7 days</div>
          <div className="mt-1 text-2xl font-bold">{done}</div>
        </Link>
      </div>
      <OfflineAgent />
      <SectionTitle>My open jobs</SectionTitle>
      {open.length === 0 ? (
        <div className="card p-5 text-sm text-charcoal-500">No open jobs are assigned to you.</div>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {open.map((j) => {
            const today = j.scheduledStart && dayKey(j.scheduledStart) === dayKey(now);
            const phone = j.contactNumber.replace(/[^\d+]/g, "");
            return (
              <li key={j.id} className={`card p-4 ${today ? "border-l-4 border-l-kudu-600" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/job-cards/${j.id}`} className="font-bold text-kudu-700 hover:underline">{j.number}</Link>
                  <JobStatusBadge status={j.status} custom={j.customStatus} />
                </div>
                <div className="mt-1 text-sm font-semibold">{j.customer.name}</div>
                <div className="text-sm text-charcoal-600">
                  {[j.scheduledStart ? `${today ? "Today " : ""}${fmtDateTime(j.scheduledStart)}` : "Not scheduled", j.jobType].filter(Boolean).join(" · ")}
                </div>
                {j.siteAddress && <div className="mt-1 text-sm whitespace-pre-line text-charcoal-700">{j.siteAddress}</div>}
                {(j.siteContact || j.contactNumber) && <div className="text-sm text-charcoal-600">{[j.siteContact, j.contactNumber].filter(Boolean).join(" · ")}</div>}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {phone ? <a href={`tel:${phone}`} className="btn-outline py-2 text-center">Call</a> : <span className="btn-outline pointer-events-none py-2 text-center opacity-40">Call</span>}
                  {j.siteAddress ? (
                    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(j.siteAddress)}`} target="_blank" rel="noreferrer" className="btn-outline py-2 text-center">Map</a>
                  ) : (
                    <span className="btn-outline pointer-events-none py-2 text-center opacity-40">Map</span>
                  )}
                  <Link href={`/job-cards/${j.id}/edit`} className="btn-outline py-2 text-center">Fill in</Link>
                  <Link href={`/sign/${j.id}`} className="btn-primary py-2 text-center">Sign-off</Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
