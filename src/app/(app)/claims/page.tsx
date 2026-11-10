import Link from "next/link";
import type { ExpenseStatus, Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";
import { mayDecideOwn } from "@/lib/approval";
import { centsToInput, dayKey, fmtDate, money, toDateInput } from "@/lib/format";
import { EXPENSE_CATEGORIES } from "@/lib/marketing";
import { approveClaim, rejectClaim, setClaimReimbursed, submitClaim, withdrawClaim } from "@/app/actions/claims";
import { Empty, Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DecideForms } from "@/components/Approvals";
import { ReceiptInput } from "@/components/ReceiptInput";

export const metadata = { title: "Expense claims" };

const STATUS: Record<ExpenseStatus, { label: string; className: string }> = {
  SUBMITTED: { label: "Waiting for approval", className: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approved", className: "bg-emerald-100 text-emerald-800" },
  REJECTED: { label: "Rejected", className: "bg-kudu-100 text-kudu-700" },
};

export default async function ClaimsPage({ searchParams }: { searchParams: Promise<{ view?: string; edit?: string; msg?: string; err?: string }> }) {
  const user = await requirePermission("expenses.claim");
  const db = await tenantDb();
  const settings = await getSettings();
  const sp = await searchParams;
  const manager = can(user, "expenses.approve") || can(user, "expenses.manage");
  const approver = can(user, "expenses.approve");
  const view = manager && sp.view && ["all", "waiting", "unpaid"].includes(sp.view) ? sp.view : "mine";
  const where: Prisma.ExpenseWhereInput = {
    claimantId: view === "mine" ? user.id : { not: null },
    ...(view === "waiting" ? { status: "SUBMITTED" } : view === "unpaid" ? { status: "APPROVED", reimbursedAt: null } : {}),
  };
  const [claims, owed, editing] = await Promise.all([
    db.expense.findMany({ where, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 300, omit: { receipt: true } }).then(async (rows) => {
      // Which rows have a receipt, without loading the images.
      const withReceipt = new Set(
        (await db.expense.findMany({ where: { id: { in: rows.map((r) => r.id) }, receipt: { not: null } }, select: { id: true } })).map((r) => r.id),
      );
      return rows.map((r) => ({ ...r, hasReceipt: withReceipt.has(r.id) }));
    }),
    db.expense.aggregate({ where: { claimantId: view === "mine" ? user.id : { not: null }, status: "APPROVED", reimbursedAt: null }, _sum: { totalPaid: true }, _count: true }),
    sp.edit ? db.expense.findFirst({ where: { id: sp.edit, claimantId: user.id, status: { in: ["SUBMITTED", "REJECTED"] } }, omit: { receipt: true } }) : null,
  ]);
  const hasReceipt = editing ? (await db.expense.count({ where: { id: editing.id, receipt: { not: null } } })) > 0 : false;
  const m = (c: number) => money(c, settings.currencySymbol);
  const views = [
    { key: "mine", label: "My claims" },
    ...(manager ? [{ key: "waiting", label: "Waiting for approval" }, { key: "unpaid", label: "Approved, not paid back" }, { key: "all", label: "Everyone's" }] : []),
  ];
  const returnTo = `/claims?view=${view}`;

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Expense claims"
        subtitle="Paid for something for work out of your own pocket? Claim it back here with a photo of the slip."
        actions={can(user, "expenses.manage") ? <Link href="/expenses" className="btn-outline">Expenses</Link> : undefined}
      />
      <Flash message={sp.msg} />
      <Flash message={sp.err} tone="error" />

      <form action={submitClaim} className="card mb-6 p-5" key={editing?.id ?? "new"}>
        <SectionTitle>{editing ? "Change and resubmit your claim" : "New claim"}</SectionTitle>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        {editing?.decisionNote && <p className="mb-3 text-sm text-kudu-700">Rejected: {editing.decisionNote}</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Date paid *"><input type="date" name="date" required className="input" defaultValue={editing ? toDateInput(editing.date) : dayKey(new Date())} /></Field>
          <Field label="Category *"><input name="category" list="claim-categories" required className="input" defaultValue={editing?.category} placeholder="Pick or type" /></Field>
          <Field label="Amount paid *"><input name="totalPaid" inputMode="decimal" required className="input" defaultValue={editing ? centsToInput(editing.totalPaid) : ""} placeholder="0.00" /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="hasVat" defaultChecked={editing ? editing.amount !== editing.totalPaid : true} className="h-4 w-4 accent-kudu-600" />
            The slip includes VAT
          </label>
          <Field label="What for" className="lg:col-span-2"><input name="description" className="input" defaultValue={editing?.description} placeholder="e.g. Fuel for the Bakkie, Stellenbosch job" /></Field>
          <Field label="Where (shop or supplier)" className="lg:col-span-2"><input name="supplier" className="input" defaultValue={editing?.supplier} /></Field>
        </div>
        <datalist id="claim-categories">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="mt-3"><ReceiptInput hasExisting={hasReceipt} /></div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary">{editing ? "Resubmit claim" : "Submit claim"}</button>
          {editing && <Link href="/claims" className="btn-outline">Cancel</Link>}
        </div>
        {settings.claimAutoApprove > 0 && <p className="mt-2 text-xs text-charcoal-500">Claims under {m(settings.claimAutoApprove)} are approved automatically.</p>}
      </form>

      {views.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {views.map((v) => (
            <Link key={v.key} href={`/claims?view=${v.key}`} className={`rounded-full px-3 py-1 text-sm font-medium ${view === v.key ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200 hover:text-kudu-600"}`}>
              {v.label}
            </Link>
          ))}
        </div>
      )}
      <div className="card overflow-x-auto p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle>{views.find((v) => v.key === view)?.label}</SectionTitle>
          {owed._count > 0 && <span className="text-sm">{view === "mine" ? "Owed to you" : "Owed to staff"}: <b className="tabular-nums">{m(owed._sum.totalPaid ?? 0)}</b> ({owed._count} approved, not paid back)</span>}
        </div>
        {claims.length === 0 ? (
          <Empty>No claims here.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Date</th>{view !== "mine" && <th>Who</th>}<th>Claim</th><th className="text-right">Amount</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {claims.map((c) => {
                const own = c.claimantId === user.id;
                const canDecide = approver && (!own || mayDecideOwn(user));
                return (
                  <tr key={c.id}>
                    <td className="whitespace-nowrap">{fmtDate(c.date)}</td>
                    {view !== "mine" && <td>{c.claimantName}</td>}
                    <td>
                      <div className="font-medium">{c.category}</div>
                      <div className="text-xs text-charcoal-500">{[c.description, c.supplier].filter(Boolean).join(" · ")}</div>
                      {c.hasReceipt && <a href={`/api/receipts/${c.id}`} target="_blank" rel="noreferrer" className="text-xs text-kudu-600 hover:underline">View receipt</a>}
                      {!c.hasReceipt && <div className="text-xs text-amber-700">No receipt</div>}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      {m(c.totalPaid)}
                      {c.amount !== c.totalPaid && <div className="text-xs text-charcoal-500">{m(c.amount)} excl. VAT</div>}
                    </td>
                    <td className="text-sm">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${STATUS[c.status].className}`}>{STATUS[c.status].label}</span>
                      {c.status !== "SUBMITTED" && c.decidedBy && <div className="text-xs text-charcoal-500">by {c.decidedBy}</div>}
                      {c.status === "REJECTED" && c.decisionNote && <div className="text-xs text-kudu-700">{c.decisionNote}</div>}
                      {c.status === "APPROVED" && <div className="text-xs text-charcoal-500">{c.reimbursedAt ? `Paid back ${fmtDate(c.reimbursedAt)}` : "Not paid back yet"}</div>}
                    </td>
                    <td className="min-w-48 text-right">
                      {own && c.status !== "APPROVED" && (
                        <div className="mb-1 flex justify-end gap-3 text-sm">
                          <Link href={`/claims?edit=${c.id}`} className="text-kudu-600 hover:underline">Change</Link>
                          <form action={withdrawClaim}>
                            <input type="hidden" name="id" value={c.id} />
                            <ConfirmButton message="Withdraw this claim?" className="text-charcoal-400 hover:text-kudu-600">Withdraw</ConfirmButton>
                          </form>
                        </div>
                      )}
                      {canDecide && c.status === "SUBMITTED" && <DecideForms id={c.id} approve={approveClaim} reject={rejectClaim} returnTo={returnTo} rejectLabel="Reject" />}
                      {approver && c.status === "APPROVED" && (
                        <form action={setClaimReimbursed}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="paid" value={c.reimbursedAt ? "0" : "1"} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button className={c.reimbursedAt ? "text-xs text-charcoal-400 hover:text-kudu-600" : "btn-outline py-1 text-xs"}>{c.reimbursedAt ? "Undo paid back" : "Mark paid back"}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
