import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { isOverdueInvoice, portalInvoices, portalJobs, portalQuotes } from "@/lib/portalData";
import { InvoiceBadge, PortalNotice, ServiceBadge } from "@/components/Portal";
import { SectionTitle } from "@/components/ui";
import { isOpen } from "@/lib/queries";

export default async function PortalHome({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const settings = await getSettings();
  const { msg } = await searchParams;
  const sym = settings.currencySymbol;
  const now = new Date();
  const [awaiting, unpaid, upcoming, recent, queries] = await Promise.all([
    db.quotation.findMany({ where: { ...portalQuotes(user.customerId), status: "SENT" }, orderBy: { issueDate: "desc" } }),
    db.invoice.findMany({ where: { ...portalInvoices(user.customerId), status: { in: ["SENT", "PARTIALLY_PAID"] } }, orderBy: { dueDate: "asc" } }),
    db.jobCard.findMany({
      where: { ...portalJobs(user.customerId), status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
      orderBy: [{ scheduledStart: { sort: "asc", nulls: "last" } }],
      take: 5,
    }),
    db.jobCard.findMany({ where: { ...portalJobs(user.customerId), status: "COMPLETED" }, orderBy: [{ jobDate: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }], take: 5 }),
    db.query.findMany({ where: { customerId: user.customerId }, orderBy: { createdAt: "desc" }, take: 20, select: { status: true } }),
  ]);
  const due = unpaid.reduce((s, i) => s + i.total - i.amountPaid, 0);
  const overdue = unpaid.filter((i) => isOverdueInvoice(i, now)).reduce((s, i) => s + i.total - i.amountPaid, 0);
  const nextVisit = upcoming.find((j) => j.scheduledStart && j.scheduledStart >= new Date(now.getTime() - 12 * 3600000));
  const openQueries = queries.filter((q) => isOpen(q.status)).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hello, {user.name.split(" ")[0]}</h1>
          <p className="text-sm text-charcoal-500">{user.customerName}</p>
        </div>
        <Link href="/portal/queries/new" className="btn-primary">Ask a question or book a service</Link>
      </div>
      <PortalNotice msg={msg} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/portal/invoices" className="card border-l-4 border-l-kudu-600 p-4 hover:shadow-md">
          <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Balance due</div>
          <div className="mt-1 text-2xl font-bold">{money(due, sym)}</div>
          {overdue > 0 && <div className="text-sm font-semibold text-kudu-700">{money(overdue, sym)} overdue</div>}
        </Link>
        <Link href={nextVisit ? `/portal/services/${nextVisit.id}` : "/portal/services"} className="card border-l-4 border-l-kudu-600 p-4 hover:shadow-md">
          <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Next visit</div>
          <div className="mt-1 text-lg font-bold">{nextVisit?.scheduledStart ? fmtDateTime(nextVisit.scheduledStart) : "None booked"}</div>
          {nextVisit?.jobType && <div className="text-sm text-charcoal-600">{nextVisit.jobType}</div>}
        </Link>
        <Link href="/portal/queries" className="card border-l-4 border-l-kudu-600 p-4 hover:shadow-md">
          <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Open queries</div>
          <div className="mt-1 text-2xl font-bold">{openQueries}</div>
        </Link>
      </div>

      {(awaiting.length > 0 || unpaid.length > 0) && (
        <section className="card p-5">
          <SectionTitle>Needs your attention</SectionTitle>
          <ul className="divide-y divide-charcoal-100 text-sm">
            {awaiting.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/portal/quotations/${q.id}`} className="font-medium hover:text-kudu-600">
                  Quotation {q.number}{q.title && ` · ${q.title}`}
                  <span className="block text-xs font-normal text-charcoal-500">{money(q.total, sym)} · valid until {fmtDate(q.validUntil)}</span>
                </Link>
                <Link href={`/portal/quotations/${q.id}`} className="btn-primary py-1 text-xs">View and answer</Link>
              </li>
            ))}
            {unpaid.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <Link href={`/portal/invoices/${i.id}`} className="font-medium hover:text-kudu-600">
                  Invoice {i.number}
                  <span className="block text-xs font-normal text-charcoal-500">{money(i.total - i.amountPaid, sym)} due {fmtDate(i.dueDate)}</span>
                </Link>
                <InvoiceBadge status={i.status} overdue={isOverdueInvoice(i, now)} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <SectionTitle>Upcoming visits</SectionTitle>
          {upcoming.length === 0 ? (
            <p className="text-sm text-charcoal-500">No visits booked.</p>
          ) : (
            <ul className="divide-y divide-charcoal-100 text-sm">
              {upcoming.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 py-2.5">
                  <Link href={`/portal/services/${j.id}`} className="hover:text-kudu-600">
                    <span className="font-medium">{j.scheduledStart ? fmtDateTime(j.scheduledStart) : "Date to be confirmed"}</span>
                    <span className="block text-xs text-charcoal-500">{[j.jobType, j.number].filter(Boolean).join(" · ")}</span>
                  </Link>
                  <ServiceBadge status={j.status} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-5">
          <SectionTitle>Recent services</SectionTitle>
          {recent.length === 0 ? (
            <p className="text-sm text-charcoal-500">No completed services yet.</p>
          ) : (
            <ul className="divide-y divide-charcoal-100 text-sm">
              {recent.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 py-2.5">
                  <Link href={`/portal/services/${j.id}`} className="hover:text-kudu-600">
                    <span className="font-medium">{fmtDate(j.jobDate ?? j.updatedAt)}</span>
                    <span className="block text-xs text-charcoal-500">{[j.jobType || j.areaTreated, j.number].filter(Boolean).join(" · ")}</span>
                  </Link>
                  <span className="text-xs font-medium text-kudu-600">Certificate →</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
