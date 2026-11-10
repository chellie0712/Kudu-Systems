import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { currentBranchId, getBranches } from "@/lib/branch";
import { fmtDate, money } from "@/lib/format";
import { colourClass } from "@/lib/jobStatus";
import { fmtDuration, openJobs, pipeline, stepTimes, waitingProcesses } from "@/lib/monitor";
import { Empty, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Process monitor" };

const RANGES = [30, 90, 365] as const;

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requirePermission("reports.view");
  await requirePermission("jobcards.viewAll");
  const db = await tenantDb();
  const settings = await getSettings();
  const sym = settings.currencySymbol;
  const sp = await searchParams;
  const range = RANGES.find((r) => String(r) === sp.days) ?? 90;
  const now = new Date();
  const from = new Date(now.getTime() - range * 86400000);
  const branchId = await currentBranchId();
  const branchName = branchId ? (await getBranches()).find((b) => b.id === branchId)?.name : null;

  const jobs = await openJobs(db, settings, branchId, now);
  const [columns, steps, waiting] = await Promise.all([pipeline(db, jobs, now), stepTimes(db, settings, from, now, branchId), waitingProcesses(db, settings, branchId, now)]);
  const stuck = jobs.filter((j) => j.stuck).sort((a, b) => a.since.getTime() - b.since.getTime());
  const age = (d: Date) => fmtDuration(now.getTime() - d.getTime());
  const maxStep = Math.max(1, ...steps.steps.map((s) => s.avgMs));
  const waitingCount = waiting.notInvoiced.length + waiting.quotes.length + waiting.accepted.length + waiting.approvals.length + waiting.overdueInvoices.length + waiting.overdueQueries.length;

  return (
    <div>
      <PageHeader
        title="Process monitor"
        subtitle={`Where every job is, how long it has been there, and what is waiting on someone.${branchName ? ` ${branchName} branch only.` : ""}`}
        actions={<Link href="/settings#statuses" className="btn-outline">When is a job stuck?</Link>}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Open jobs", value: String(jobs.length), href: "#pipeline" },
          { label: "Stuck jobs", value: String(stuck.length), href: "#stuck", alert: stuck.length > 0 },
          { label: `Created → completed (${range} days)`, value: steps.completed ? fmtDuration(steps.leadAvgMs) : "—", sub: steps.completed ? `median ${fmtDuration(steps.leadMedianMs)} · ${steps.completed} job${steps.completed === 1 ? "" : "s"}` : "No completions yet" },
          { label: "Other things waiting", value: String(waitingCount), href: "#waiting", alert: waitingCount > 0 },
        ].map((t) => (
          <a key={t.label} href={t.href} className="card block p-4 hover:ring-1 hover:ring-kudu-200">
            <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">{t.label}</div>
            <div className={`mt-1 text-xl font-bold ${t.alert ? "text-kudu-600" : ""}`}>{t.value}</div>
            {t.sub && <div className="text-xs text-charcoal-500">{t.sub}</div>}
          </a>
        ))}
      </div>

      <section id="pipeline" className="mb-8">
        <SectionTitle>Job pipeline</SectionTitle>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((c) => (
            <div key={c.key} className="card w-64 shrink-0 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.colour ? colourClass(c.colour) : "bg-charcoal-100 text-charcoal-700"}`}>{c.name}</span>
                <span className="text-sm font-bold">{c.jobs.length}</span>
              </div>
              <div className="mb-2 text-xs text-charcoal-500">
                {c.jobs.length ? <>avg {fmtDuration(c.avgMs)} · oldest {fmtDuration(c.oldestMs)}</> : "Empty"}
                {c.stuck > 0 && <span className="ml-1 font-semibold text-kudu-600">· {c.stuck} stuck</span>}
              </div>
              <ul className="space-y-1.5">
                {c.jobs.slice(0, 8).map((j) => (
                  <li key={j.id}>
                    <Link href={`/job-cards/${j.id}`} className={`block rounded-md border px-2 py-1.5 text-xs hover:border-kudu-300 ${j.stuck ? "border-kudu-200 bg-kudu-50" : "border-charcoal-100"}`}>
                      <div className="flex justify-between gap-2 font-semibold">
                        <span>{j.number}</span>
                        <span className={j.stuck ? "text-kudu-700" : "text-charcoal-500"}>{j.approx ? "≥ " : ""}{age(j.since)}</span>
                      </div>
                      <div className="truncate text-charcoal-600">{j.customer}</div>
                      {j.technician && <div className="truncate text-charcoal-400">{j.technician}</div>}
                    </Link>
                  </li>
                ))}
              </ul>
              {c.jobs.length > 8 && <div className="mt-1 text-xs text-charcoal-500">+ {c.jobs.length - 8} more</div>}
            </div>
          ))}
        </div>
      </section>

      <section id="stuck" className="mb-8">
        <SectionTitle>Stuck jobs</SectionTitle>
        <div className="card overflow-x-auto">
          {stuck.length === 0 ? (
            <Empty>Nothing is stuck. Jobs count as stuck after {settings.jobStuckDays} days in one status, when they are overdue to start, or when they start soon with nobody assigned.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal-200 text-left text-xs uppercase text-charcoal-500">
                  <th className="px-4 py-2">Job</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">In status</th>
                  <th className="px-4 py-2">Why</th>
                  <th className="px-4 py-2">Assigned to</th>
                </tr>
              </thead>
              <tbody>
                {stuck.map((j) => (
                  <tr key={j.id} className="border-b border-charcoal-100">
                    <td className="px-4 py-2 font-medium"><Link href={`/job-cards/${j.id}`} className="hover:text-kudu-600">{j.number}</Link></td>
                    <td className="px-4 py-2"><Link href={`/customers/${j.customerId}`} className="hover:text-kudu-600">{j.customer}</Link></td>
                    <td className="px-4 py-2">{j.statusName}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{j.approx ? "≥ " : ""}{age(j.since)}</td>
                    <td className="px-4 py-2 text-kudu-700">{j.stuck}</td>
                    <td className="px-4 py-2">{j.technician || <span className="text-charcoal-400">Nobody</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-charcoal-100 pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-kudu-600">How long each step takes</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Link key={r} href={`/monitor?days=${r}`} className={`rounded-full px-3 py-1 text-xs font-medium ${r === range ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200"}`}>
                Last {r} days
              </Link>
            ))}
          </div>
        </div>
        <div className="card overflow-x-auto">
          {steps.steps.length === 0 ? (
            <Empty>No status changes recorded in this period yet. Times build up as jobs move from one status to the next.</Empty>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-charcoal-200 text-left text-xs uppercase text-charcoal-500">
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2 w-2/5">Average time in it</th>
                  <th className="px-4 py-2">Median</th>
                  <th className="px-4 py-2">Longest</th>
                  <th className="px-4 py-2 text-right">Jobs</th>
                </tr>
              </thead>
              <tbody>
                {steps.steps.map((s) => (
                  <tr key={s.name} className="border-b border-charcoal-100">
                    <td className="px-4 py-2 font-medium">{s.name}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-2 rounded-full bg-kudu-500" style={{ width: `${Math.max(4, (s.avgMs / maxStep) * 100)}%` }} />
                        <span className="whitespace-nowrap">{fmtDuration(s.avgMs)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDuration(s.medianMs)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDuration(s.maxMs)}</td>
                    <td className="px-4 py-2 text-right">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <p className="mt-2 text-xs text-charcoal-500">
          Counts the time a job spent in a status before moving on, for moves in the period. Status history is recorded from {fmtDate(settings.statusTrackingSince)};
          earlier moves are not known, and their times show as “≥” in the pipeline.
        </p>
      </section>

      <section id="waiting">
        <SectionTitle>Waiting on someone</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <WaitList
            title="Completed, not invoiced"
            help={`More than ${settings.invoiceAfterDays} days after completion.`}
            items={waiting.notInvoiced.map((j) => ({ key: j.id, href: `/job-cards/${j.id}`, label: j.number, sub: j.customer.name, right: `${age(j.completedAt)} ago` }))}
          />
          <WaitList
            title="Quotes with no answer"
            help={`Sent more than ${settings.quoteFollowUpDays} days ago. Follow up.`}
            items={waiting.quotes.map((q) => ({ key: q.id, href: `/quotations/${q.id}`, label: q.number, sub: `${q.customer.name} · ${money(q.total, sym)}`, right: `${age(q.issueDate)}` }))}
          />
          <WaitList
            title="Accepted quotes not started"
            help="No job card or invoice made from them yet."
            items={waiting.accepted.map((q) => ({ key: q.id, href: `/quotations/${q.id}`, label: q.number, sub: `${q.customer.name} · ${money(q.total, sym)}`, right: `${age(q.updatedAt)}` }))}
          />
          <WaitList
            title="Invoices awaiting approval"
            help="Sent for approval, not yet approved."
            items={waiting.approvals.map((i) => ({ key: i.id, href: `/invoices/${i.id}`, label: i.number, sub: `${i.customer.name} · ${money(i.total, sym)}`, right: i.approvalRequestedAt ? age(i.approvalRequestedAt) : "" }))}
          />
          <WaitList
            title="Overdue invoices"
            help="Past their due date and not fully paid."
            items={waiting.overdueInvoices.map((i) => ({ key: i.id, href: `/invoices/${i.id}`, label: i.number, sub: `${i.customer.name} · ${money(i.total - i.amountPaid, sym)} due`, right: `${age(i.dueDate)} late` }))}
          />
          <WaitList
            title="Overdue queries"
            help="Open past their respond-by date."
            items={waiting.overdueQueries.map((q) => ({ key: q.id, href: `/queries/${q.id}`, label: q.number, sub: `${q.customer.name} · ${q.subject}`, right: q.dueAt ? `${age(q.dueAt)} late` : "" }))}
          />
        </div>
      </section>
    </div>
  );
}

function WaitList({ title, help, items }: { title: string; help: string; items: { key: string; href: string; label: string; sub: string; right: string }[] }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${items.length ? "bg-kudu-100 text-kudu-700" : "bg-charcoal-100 text-charcoal-500"}`}>{items.length}</span>
      </div>
      <p className="mb-2 text-xs text-charcoal-500">{help}</p>
      {items.length === 0 ? (
        <p className="text-sm text-charcoal-400">None.</p>
      ) : (
        <ul className="divide-y divide-charcoal-100 text-sm">
          {items.slice(0, 6).map((i) => (
            <li key={i.key} className="flex items-start justify-between gap-2 py-1.5">
              <Link href={i.href} className="min-w-0 hover:text-kudu-600">
                <div className="font-medium">{i.label}</div>
                <div className="truncate text-xs text-charcoal-500">{i.sub}</div>
              </Link>
              <span className="shrink-0 text-xs text-charcoal-500">{i.right}</span>
            </li>
          ))}
          {items.length > 6 && <li className="pt-1.5 text-xs text-charcoal-500">+ {items.length - 6} more</li>}
        </ul>
      )}
    </div>
  );
}
