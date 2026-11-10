import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { approvalLists, approvesAnything } from "@/lib/approvalInbox";
import { fmtLeaveRange, LEAVE_TYPE_LABELS } from "@/lib/leave";
import { approveInvoice, rejectInvoice } from "@/app/actions/invoices";
import { approveQuote, rejectQuote } from "@/app/actions/quotations";
import { approvePo, rejectPo } from "@/app/actions/purchases";
import { approveClaim, rejectClaim } from "@/app/actions/claims";
import { approveLeave, declineLeave } from "@/app/actions/leave";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { DecideForms } from "@/components/Approvals";

export const metadata = { title: "Approvals" };

const age = (d: Date | null) => {
  if (!d) return "";
  const h = Math.floor((Date.now() - d.getTime()) / 3600000);
  return h < 1 ? "just now" : h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
};

function Section({ id, title, count, children }: { id: string; title: string; count: number; children: React.ReactNode }) {
  return (
    <section id={id} className="card mb-6 p-5">
      <SectionTitle>
        {title} <span className="ml-1 rounded-full bg-charcoal-100 px-2 py-0.5 text-xs font-semibold text-charcoal-600">{count}</span>
      </SectionTitle>
      {count === 0 ? <Empty>Nothing waiting.</Empty> : <ul className="divide-y divide-charcoal-100">{children}</ul>}
    </section>
  );
}

function Row({ main, sub, amount, decide }: { main: React.ReactNode; sub: React.ReactNode; amount?: string; decide: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
      <div className="min-w-56 flex-1">
        <div className="font-semibold">{main}</div>
        <div className="text-xs text-charcoal-500">{sub}</div>
      </div>
      {amount && <div className="w-28 text-right font-semibold tabular-nums">{amount}</div>}
      <div className="w-full sm:w-auto sm:min-w-80">{decide}</div>
    </li>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser();
  if (!approvesAnything(user)) redirect("/no-access?need=invoices.approve");
  const db = await tenantDb();
  const settings = await getSettings();
  const { msg, err } = await searchParams;
  const l = await approvalLists(db, user, settings);
  const m = (c: number) => money(c, settings.currencySymbol);
  const R = "/approvals";
  // Others already off while a leave request would be away.
  const overlaps = l.leave?.length
    ? await db.leaveRequest.findMany({
        where: { status: "APPROVED", OR: l.leave.map((r) => ({ startDate: { lte: r.endDate }, endDate: { gte: r.startDate } })) },
        include: { user: { select: { name: true, email: true } } },
      })
    : [];
  const total = (l.invoices?.length ?? 0) + (l.quotes?.length ?? 0) + (l.pos?.length ?? 0) + (l.claims?.length ?? 0) + (l.leave?.length ?? 0);

  return (
    <div className="max-w-5xl">
      <PageHeader title="Approvals" subtitle={total ? `${total} waiting for you. Oldest first.` : "Nothing is waiting for you."} />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {l.quotes && (
        <Section id="quotes" title="Quotations" count={l.quotes.length}>
          {l.quotes.map((q) => (
            <Row
              key={q.id}
              main={<Link href={`/quotations/${q.id}`} className="text-kudu-700 hover:underline">{q.number} · {q.customer.name}</Link>}
              sub={`${q.title ? `${q.title} · ` : ""}submitted by ${q.approvalRequestedBy || "?"} ${age(q.approvalRequestedAt)}`}
              amount={m(q.total)}
              decide={<DecideForms id={q.id} approve={approveQuote} reject={rejectQuote} returnTo={R} />}
            />
          ))}
        </Section>
      )}
      {l.invoices && (
        <Section id="invoices" title="Invoices" count={l.invoices.length}>
          {l.invoices.map((i) => (
            <Row
              key={i.id}
              main={<Link href={`/invoices/${i.id}`} className="text-kudu-700 hover:underline">{i.number} · {i.customer.name}</Link>}
              sub={`Submitted by ${i.approvalRequestedBy || "?"} ${age(i.approvalRequestedAt)}`}
              amount={m(i.total)}
              decide={<DecideForms id={i.id} approve={approveInvoice} reject={rejectInvoice} returnTo={R} />}
            />
          ))}
        </Section>
      )}
      {l.pos && (
        <Section id="purchase-orders" title="Purchase orders" count={l.pos.length}>
          {l.pos.map((p) => (
            <Row
              key={p.id}
              main={<Link href={`/purchase-orders/${p.id}`} className="text-kudu-700 hover:underline">{p.number} · {p.supplier}</Link>}
              sub={`${p._count.lines} line${p._count.lines === 1 ? "" : "s"} · submitted by ${p.approvalRequestedBy || "?"} ${age(p.approvalRequestedAt)}`}
              amount={m(p.total)}
              decide={<DecideForms id={p.id} approve={approvePo} reject={rejectPo} returnTo={R} />}
            />
          ))}
        </Section>
      )}
      {l.claims && (
        <Section id="claims" title="Expense claims" count={l.claims.length}>
          {l.claims.map((c) => (
            <Row
              key={c.id}
              main={<>{c.claimantName} · {c.category}</>}
              sub={
                <>
                  {fmtDate(c.date)}
                  {c.description && ` · ${c.description}`}
                  {c.supplier && ` · ${c.supplier}`} · submitted {age(c.submittedAt)} ·{" "}
                  {c.hasReceipt ? <a href={`/api/receipts/${c.id}`} target="_blank" rel="noreferrer" className="text-kudu-600 hover:underline">View receipt</a> : <span className="text-amber-700">no receipt</span>}
                </>
              }
              amount={m(c.totalPaid)}
              decide={<DecideForms id={c.id} approve={approveClaim} reject={rejectClaim} returnTo={R} rejectLabel="Reject" />}
            />
          ))}
        </Section>
      )}
      {l.leave && (
        <Section id="leave" title="Leave requests" count={l.leave.length}>
          {l.leave.map((r) => {
            const also = overlaps.filter((o) => o.userId !== r.userId && o.startDate <= r.endDate && o.endDate >= r.startDate);
            return (
              <Row
                key={r.id}
                main={<>{r.user.name || r.user.email} · {LEAVE_TYPE_LABELS[r.type]} · {r.days} day{r.days === 1 ? "" : "s"}</>}
                sub={
                  <>
                    {fmtLeaveRange(r.startDate, r.endDate, r.halfDay)}
                    {r.reason && ` · ${r.reason}`} · asked {fmtDateTime(r.createdAt)}
                    {also.length > 0 && <span className="block text-amber-700">Also off then: {[...new Set(also.map((o) => o.user.name || o.user.email))].join(", ")}</span>}
                  </>
                }
                decide={<DecideForms id={r.id} approve={approveLeave} reject={declineLeave} returnTo={R} rejectLabel="Decline" />}
              />
            );
          })}
        </Section>
      )}
      <p className="text-xs text-charcoal-500">
        Switch approval of invoices, quotations and purchase orders on or off, and set amounts, under <Link href="/settings#approval" className="text-kudu-600">Settings → Approvals</Link>.
      </p>
    </div>
  );
}
