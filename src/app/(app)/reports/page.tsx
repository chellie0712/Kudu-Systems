import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { currentBranchId, getBranches } from "@/lib/branch";
import { fmtDate, money } from "@/lib/format";
import { entryMinutes, fmtMinutes } from "@/lib/labour";
import { AGE_BUCKETS, ageBucket, byMonth, FORECAST_BUCKETS, forecastBucket, monthLabel, monthsOf, periodFrom, PRESET_LABELS, PRESETS } from "@/lib/reports";
import { PageHeader, SectionTitle } from "@/components/ui";
import { MonthBars } from "@/components/MonthBars";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; preset?: string }> }) {
  await requirePermission("reports.view");
  const db = await tenantDb();
  const sp = await searchParams;
  const p = periodFrom(sp);
  const settings = await getSettings();
  const sym = settings.currencySymbol;
  const m = (c: number) => money(Math.round(c), sym);
  const now = new Date();
  const branchId = await currentBranchId();
  const branchName = branchId ? (await getBranches()).find((b) => b.id === branchId)?.name : null;
  const ofBranch = branchId ? { customer: { branchId } } : {};
  const inRange = { gte: p.from, lt: p.to };

  const [invoices, payments, quotes, outstanding, jobs, time, materials] = await Promise.all([
    db.invoice.findMany({
      where: { issueDate: inRange, status: { notIn: ["DRAFT", "CANCELLED"] }, ...ofBranch },
      select: { issueDate: true, total: true, vatAmount: true, customer: { select: { id: true, name: true } } },
    }),
    db.payment.findMany({ where: { date: inRange, invoice: ofBranch }, select: { date: true, amount: true } }),
    db.quotation.groupBy({ by: ["status"], where: { issueDate: inRange, ...ofBranch }, _count: true, _sum: { total: true } }),
    db.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, ...ofBranch },
      select: { id: true, number: true, dueDate: true, total: true, amountPaid: true, customer: { select: { id: true, name: true } } },
    }),
    db.jobCard.findMany({ where: { status: "COMPLETED", jobDate: inRange, ...ofBranch }, select: { technicianId: true, technician: true } }),
    db.timeEntry.findMany({ where: { start: inRange, end: { not: null }, jobCard: ofBranch }, select: { userId: true, userName: true, start: true, end: true } }),
    db.stockMovement.findMany({
      where: { kind: "USE", createdAt: inRange, ...(branchId ? { jobCard: ofBranch } : {}) },
      select: { quantity: true, invoiceId: true, item: { select: { id: true, name: true, unit: true, costPrice: true, sellPrice: true } } },
    }),
  ]);

  // ----- Sales -----
  const months = monthsOf(p);
  const net = (i: { total: number; vatAmount: number }) => i.total - i.vatAmount;
  const invoicedByMonth = byMonth(invoices, (i) => i.issueDate, net);
  const paidByMonth = byMonth(payments, (x) => x.date, (x) => x.amount);
  const chartMax = Math.max(0, ...invoicedByMonth.values(), ...paidByMonth.values());
  const invoicedNet = invoices.reduce((s, i) => s + net(i), 0);
  const vat = invoices.reduce((s, i) => s + i.vatAmount, 0);
  const received = payments.reduce((s, x) => s + x.amount, 0);
  const q = (st: string) => quotes.find((r) => r.status === st);
  const accepted = q("ACCEPTED")?._count ?? 0;
  const decided = accepted + (q("DECLINED")?._count ?? 0) + (q("EXPIRED")?._count ?? 0);
  const quotesIssued = quotes.reduce((s, r) => s + r._count, 0);

  // ----- Cashflow -----
  const open = outstanding.map((i) => ({ ...i, balance: i.total - i.amountPaid })).filter((i) => i.balance > 0);
  const forecast = FORECAST_BUCKETS.map(() => 0);
  for (const i of open) forecast[forecastBucket(i.dueDate, now)] += i.balance;
  const totalOutstanding = open.reduce((s, i) => s + i.balance, 0);
  const debtors = new Map<string, { name: string; buckets: number[]; total: number }>();
  for (const i of open) {
    const d = debtors.get(i.customer.id) ?? { name: i.customer.name, buckets: AGE_BUCKETS.map(() => 0), total: 0 };
    d.buckets[ageBucket(i.dueDate, now)] += i.balance;
    d.total += i.balance;
    debtors.set(i.customer.id, d);
  }
  const debtorRows = [...debtors.entries()].sort((a, b) => b[1].total - a[1].total);
  const ageTotals = AGE_BUCKETS.map((_, k) => debtorRows.reduce((s, [, d]) => s + d.buckets[k], 0));

  // ----- Customers -----
  const custTotals = new Map<string, { name: string; total: number; count: number }>();
  for (const i of invoices) {
    const c = custTotals.get(i.customer.id) ?? { name: i.customer.name, total: 0, count: 0 };
    c.total += net(i);
    c.count++;
    custTotals.set(i.customer.id, c);
  }
  const topCustomers = [...custTotals.entries()].sort((a, b) => b[1].total - a[1].total).slice(0, 10);

  // ----- People -----
  const people = new Map<string, { name: string; jobs: number; minutes: number }>();
  const person = (id: string | null, name: string) => {
    const k = id ?? `name:${name}`;
    const v = people.get(k) ?? { name: name || "Unassigned", jobs: 0, minutes: 0 };
    people.set(k, v);
    return v;
  };
  for (const j of jobs) person(j.technicianId, j.technician).jobs++;
  for (const t of time) person(t.userId, t.userName).minutes += entryMinutes(t);
  const peopleRows = [...people.values()].sort((a, b) => b.jobs - a.jobs || b.minutes - a.minutes);

  // ----- Materials -----
  const mat = new Map<string, { name: string; unit: string; qty: number; cost: number; sell: number; billed: number }>();
  for (const x of materials) {
    const r = mat.get(x.item.id) ?? { name: x.item.name, unit: x.item.unit, qty: 0, cost: 0, sell: 0, billed: 0 };
    r.qty += x.quantity;
    r.cost += x.quantity * x.item.costPrice;
    r.sell += x.quantity * x.item.sellPrice;
    if (x.invoiceId) r.billed += x.quantity * x.item.sellPrice;
    mat.set(x.item.id, r);
  }
  const matRows = [...mat.values()].sort((a, b) => b.cost - a.cost);

  const qs = `from=${p.fromInput}&to=${p.toInput}`;
  const tiles: [string, string, string?][] = [
    ["Invoiced excl. VAT", m(invoicedNet), `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`],
    ["VAT on invoices", m(vat), "output VAT"],
    ["Payments received", m(received), `${payments.length} payment${payments.length === 1 ? "" : "s"}`],
    ["Quote conversion", decided ? `${Math.round((accepted / decided) * 100)}%` : "—", `${accepted} accepted of ${decided} decided · ${quotesIssued} issued`],
  ];

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle={`${fmtDate(p.from)} – ${fmtDate(new Date(p.to.getTime() - 1))}${branchName ? ` · ${branchName} branch` : ""}`}
        actions={
          <>
            <a href={`/api/reports/invoices?${qs}`} className="btn-outline">Invoices CSV</a>
            <a href={`/api/reports/payments?${qs}`} className="btn-outline">Payments CSV</a>
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-end gap-2">
        {PRESETS.map((k) => (
          <Link
            key={k}
            href={`/reports?preset=${k}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${p.label === PRESET_LABELS[k] ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200 hover:text-kudu-600"}`}
          >
            {PRESET_LABELS[k]}
          </Link>
        ))}
        <form className="ml-auto flex flex-wrap items-end gap-2">
          <label className="block"><span className="label">From</span><input type="date" name="from" defaultValue={p.fromInput} className="input w-40 py-1.5" /></label>
          <label className="block"><span className="label">To</span><input type="date" name="to" defaultValue={p.toInput} className="input w-40 py-1.5" /></label>
          <button className="btn-dark py-1.5">Show</button>
        </form>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="card border-l-4 border-l-kudu-600 p-5">
            <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">{label}</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
            {sub && <div className="mt-1 text-xs text-charcoal-500">{sub}</div>}
          </div>
        ))}
      </div>

      <div className="mb-3 grid gap-4 lg:grid-cols-2">
        <MonthBars title="Invoiced per month (excl. VAT)" months={months} values={invoicedByMonth} max={chartMax} format={m} />
        <MonthBars title="Payments received per month" months={months} values={paidByMonth} max={chartMax} format={m} />
      </div>
      <details className="card mb-8 overflow-x-auto p-4 text-sm">
        <summary className="cursor-pointer font-medium text-kudu-600">Show as table</summary>
        <table className="table mt-2">
          <thead><tr><th>Month</th><th className="text-right">Invoiced excl. VAT</th><th className="text-right">Received</th></tr></thead>
          <tbody>
            {months.map((k) => (
              <tr key={k}><td>{monthLabel(k)}</td><td className="text-right tabular-nums">{m(invoicedByMonth.get(k) ?? 0)}</td><td className="text-right tabular-nums">{m(paidByMonth.get(k) ?? 0)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>

      <h2 className="mb-3 text-lg font-bold text-charcoal-800">Cashflow: money owed to you <span className="text-sm font-normal text-charcoal-500">(today, not limited to the period)</span></h2>
      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <SectionTitle>Expected in</SectionTitle>
          <table className="w-full text-sm">
            <tbody>
              {FORECAST_BUCKETS.map((b, k) => (
                <tr key={b} className="border-b border-charcoal-100">
                  <td className={`py-1.5 ${k === 0 && forecast[0] > 0 ? "font-semibold text-kudu-700" : ""}`}>{b}</td>
                  <td className="py-1.5 text-right tabular-nums">{m(forecast[k])}</td>
                </tr>
              ))}
              <tr><td className="py-1.5 font-bold">Total outstanding</td><td className="py-1.5 text-right font-bold tabular-nums">{m(totalOutstanding)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-charcoal-500">Unpaid balances of sent invoices, by due date. Overdue money may not arrive.</p>
        </div>
        <div className="card overflow-x-auto p-5 lg:col-span-2">
          <SectionTitle>Aged debtors</SectionTitle>
          {debtorRows.length === 0 ? (
            <p className="text-sm text-charcoal-500">Nobody owes you money.</p>
          ) : (
            <table className="table [&_td]:whitespace-nowrap">
              <thead>
                <tr>
                  <th>Customer</th>
                  {AGE_BUCKETS.map((b) => <th key={b} className="text-right whitespace-nowrap">{b}</th>)}
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {debtorRows.map(([id, d]) => (
                  <tr key={id}>
                    <td><Link href={`/customers/${id}?tab=invoices`} className="hover:text-kudu-600">{d.name}</Link></td>
                    {d.buckets.map((v, k) => <td key={k} className={`text-right tabular-nums ${v && k >= 2 ? "font-semibold text-kudu-700" : v ? "" : "text-charcoal-300"}`}>{v ? m(v) : "—"}</td>)}
                    <td className="text-right font-semibold tabular-nums">{m(d.total)}</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td>Total</td>
                  {ageTotals.map((v, k) => <td key={k} className="text-right tabular-nums">{m(v)}</td>)}
                  <td className="text-right tabular-nums">{m(totalOutstanding)}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="card overflow-x-auto p-5">
          <SectionTitle>Top customers (invoiced excl. VAT)</SectionTitle>
          {topCustomers.length === 0 ? <p className="text-sm text-charcoal-500">No invoices in this period.</p> : (
            <table className="table">
              <thead><tr><th>Customer</th><th className="text-right">Invoices</th><th className="text-right">Amount</th><th className="text-right">Share</th></tr></thead>
              <tbody>
                {topCustomers.map(([id, c]) => (
                  <tr key={id}>
                    <td><Link href={`/customers/${id}`} className="hover:text-kudu-600">{c.name}</Link></td>
                    <td className="text-right tabular-nums">{c.count}</td>
                    <td className="text-right tabular-nums">{m(c.total)}</td>
                    <td className="text-right tabular-nums text-charcoal-500">{invoicedNet ? `${Math.round((c.total / invoicedNet) * 100)}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card overflow-x-auto p-5">
          <SectionTitle>Technicians and staff</SectionTitle>
          {peopleRows.length === 0 ? <p className="text-sm text-charcoal-500">No completed jobs or recorded time in this period.</p> : (
            <table className="table">
              <thead><tr><th>Person</th><th className="text-right">Jobs completed</th><th className="text-right">Time recorded</th></tr></thead>
              <tbody>
                {peopleRows.map((r, k) => (
                  <tr key={k}><td>{r.name}</td><td className="text-right tabular-nums">{r.jobs}</td><td className="text-right tabular-nums">{r.minutes ? fmtMinutes(r.minutes) : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-charcoal-500">Completed jobs by job date; time by the day it was worked.</p>
        </div>
      </div>

      <div className="card overflow-x-auto p-5">
        <SectionTitle>Materials used on jobs</SectionTitle>
        {matRows.length === 0 ? <p className="text-sm text-charcoal-500">No stock was booked out on job cards in this period.</p> : (
          <table className="table">
            <thead><tr><th>Product</th><th className="text-right">Quantity</th><th className="text-right">At cost</th><th className="text-right">At sell price</th><th className="text-right">Billed</th></tr></thead>
            <tbody>
              {matRows.map((r) => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="text-right tabular-nums">{Math.round(r.qty * 1000) / 1000} {r.unit}</td>
                  <td className="text-right tabular-nums">{m(r.cost)}</td>
                  <td className="text-right tabular-nums">{m(r.sell)}</td>
                  <td className={`text-right tabular-nums ${r.billed < r.sell ? "text-amber-700" : ""}`}>{m(r.billed)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Total</td><td />
                <td className="text-right tabular-nums">{m(matRows.reduce((s, r) => s + r.cost, 0))}</td>
                <td className="text-right tabular-nums">{m(matRows.reduce((s, r) => s + r.sell, 0))}</td>
                <td className="text-right tabular-nums">{m(matRows.reduce((s, r) => s + r.billed, 0))}</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
