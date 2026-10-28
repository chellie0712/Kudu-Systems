import Link from "next/link";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { addDays, fmtDate, fmtDateTime, money } from "@/lib/format";
import { PageHeader, SectionTitle, StatusBadge } from "@/components/ui";

export default async function Dashboard() {
  const user = await requireUser();
  const settings = await getSettings();
  const sym = settings.currencySymbol;
  const now = new Date();

  const [customerCount, openQuotes, openJobs, unpaid, upcoming, recentQuotes, overdue] = await Promise.all([
    db.customer.count({ where: { archived: false } }),
    db.quotation.aggregate({ where: { status: { in: ["DRAFT", "SENT"] } }, _count: true, _sum: { total: true } }),
    db.jobCard.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] } } }),
    db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID"] } }, select: { total: true, amountPaid: true, dueDate: true } }),
    db.calendarEvent.findMany({
      where: { end: { gte: now }, start: { lte: addDays(now, 14) } },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { start: "asc" },
      take: 10,
    }),
    db.quotation.findMany({ include: { customer: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: now } },
      include: { customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
  ]);
  const outstanding = unpaid.reduce((s, i) => s + i.total - i.amountPaid, 0);
  const overdueTotal = unpaid.filter((i) => i.dueDate < now).reduce((s, i) => s + i.total - i.amountPaid, 0);

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
        subtitle={fmtDate(now)}
        actions={
          <>
            <Link href="/customers/new" className="btn-outline">+ Customer</Link>
            <Link href="/quotations/new" className="btn-primary">+ Quotation</Link>
          </>
        }
      />
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
