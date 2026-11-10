import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { centsToInput, dayKey, fmtDate, money, toDateInput } from "@/lib/format";
import { periodFrom } from "@/lib/reports";
import { EXPENSE_CATEGORIES, GOOGLE_ADS } from "@/lib/marketing";
import { deleteAdSpend, deleteExpense, saveAdSpend, saveExpense } from "@/app/actions/marketing";
import { Empty, Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { PeriodPicker } from "@/components/PeriodPicker";

export const metadata = { title: "Expenses" };

const AD_CHANNELS = ["Facebook / Instagram", "Other online ads", "Print / flyers", "Radio", "Directory listing", "Other"];

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string; msg?: string; err?: string; edit?: string }>;
}) {
  await requirePermission("expenses.manage");
  const db = await tenantDb();
  const sp = await searchParams;
  const p = periodFrom({ ...sp, preset: sp.preset ?? (sp.from ? undefined : "month") });
  const inRange = { gte: p.from, lt: p.to };
  const [settings, expenses, adSpend, editing, knownCategories] = await Promise.all([
    getSettings(),
    db.expense.findMany({ where: { date: inRange, status: "APPROVED" }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    db.adSpend.findMany({ where: { date: inRange, channel: { not: GOOGLE_ADS } }, orderBy: { date: "desc" } }),
    sp.edit ? db.expense.findUnique({ where: { id: sp.edit } }) : null,
    db.expense.groupBy({ by: ["category"] }),
  ]);
  const m = (c: number) => money(c, settings.currencySymbol);
  const qs = `from=${p.fromInput}&to=${p.toInput}`;
  const back = `/expenses?${qs}`;
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...knownCategories.map((c) => c.category)])];
  const adChannels = [...new Set([...AD_CHANNELS, ...adSpend.map((a) => a.channel)])];
  const today = dayKey(new Date());

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Expenses"
        subtitle={`Business costs for the profit & loss on the Marketing report. Amounts excl. VAT. ${fmtDate(p.from)} – ${fmtDate(new Date(p.to.getTime() - 1))}`}
        actions={
          <>
            <Link href="/claims?view=all" className="btn-outline">Expense claims</Link>
            <Link href={`/marketing?${qs}`} className="btn-outline">Marketing &amp; P&amp;L</Link>
          </>
        }
      />
      <Flash message={sp.msg} />
      <Flash message={sp.err} tone="error" />
      <PeriodPicker path="/expenses" p={p} />

      <form action={saveExpense} className="card mb-6 p-5" key={editing?.id ?? "new"}>
        <SectionTitle>{editing ? "Edit expense" : "Add an expense"}</SectionTitle>
        {editing && <input type="hidden" name="id" value={editing.id} />}
        <input type="hidden" name="back" value={back} />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Date *"><input type="date" name="date" required className="input" defaultValue={editing ? toDateInput(editing.date) : today} /></Field>
          <Field label="Category *">
            <input name="category" list="expense-categories" required className="input" defaultValue={editing?.category} placeholder="Pick or type" />
          </Field>
          <Field label="Description" className="lg:col-span-2"><input name="description" className="input" defaultValue={editing?.description} /></Field>
          <Field label="Amount excl. VAT *"><input name="amount" inputMode="decimal" required className="input" defaultValue={editing ? centsToInput(editing.amount) : ""} placeholder="0.00" /></Field>
          <Field label="Supplier" className="lg:col-span-2"><input name="supplier" className="input" defaultValue={editing?.supplier} /></Field>
        </div>
        <datalist id="expense-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary">{editing ? "Save changes" : "+ Add expense"}</button>
          {editing && <Link href={back} className="btn-outline">Cancel</Link>}
        </div>
        <p className="mt-2 text-xs text-charcoal-500">
          Don&apos;t enter stock you bought for Inventory here if you also want it counted as materials: the P&amp;L already charges materials used on jobs at cost price.
        </p>
      </form>

      <div className="card mb-8 overflow-x-auto p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <SectionTitle>Expenses in this period</SectionTitle>
          <span className="text-sm font-semibold tabular-nums">Total {m(total)}</span>
        </div>
        {expenses.length === 0 ? (
          <Empty>No expenses in this period.</Empty>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2 text-xs">
              {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([c, v]) => (
                <span key={c} className="rounded-full bg-charcoal-50 px-2.5 py-1 ring-1 ring-charcoal-200">{c}: <strong className="tabular-nums">{m(v)}</strong></span>
              ))}
            </div>
            <table className="table">
              <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Supplier</th><th className="text-right">Amount</th><th /></tr></thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap">{fmtDate(e.date)}</td>
                    <td>{e.category}</td>
                    <td>
                      {e.description}
                      {e.claimantName && <div className="text-xs text-charcoal-500">Claim by {e.claimantName}{e.reimbursedAt ? ", paid back" : ", not paid back yet"}</div>}
                    </td>
                    <td>{e.supplier}</td>
                    <td className="text-right tabular-nums">{m(e.amount)}</td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`${back}&edit=${e.id}`} className="mr-3 text-sm text-kudu-600 hover:underline">Edit</Link>
                      <form action={deleteExpense} className="inline">
                        <input type="hidden" name="id" value={e.id} />
                        <input type="hidden" name="back" value={back} />
                        <ConfirmButton message={`Delete this ${e.category} expense of ${m(e.amount)}?`} className="text-sm text-charcoal-400 hover:text-kudu-600">Delete</ConfirmButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div id="ad-spend" className="card p-5">
        <SectionTitle>Other advertising (not Google Ads)</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">
          Google Ads spend comes in automatically. Enter spend on other channels here (for example a month of Facebook ads as one line) so the Marketing report can work out their cost per lead.
          Use the same campaign name you pick on the customer. Don&apos;t also enter it as an expense, or it is counted twice.
        </p>
        <form action={saveAdSpend} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <input type="hidden" name="back" value={`${back}#ad-spend`} />
          <Field label="Date *"><input type="date" name="date" required className="input" defaultValue={today} /></Field>
          <Field label="Channel *">
            <input name="channel" list="ad-channels" required className="input" placeholder="Pick or type" />
          </Field>
          <Field label="Campaign" className="lg:col-span-2"><input name="campaign" className="input" placeholder="Leave blank for the whole channel" /></Field>
          <Field label="Cost excl. VAT *"><input name="cost" inputMode="decimal" required className="input" placeholder="0.00" /></Field>
          <Field label="Clicks"><input name="clicks" inputMode="numeric" className="input" placeholder="0" /></Field>
          <div className="lg:col-span-6"><button className="btn-primary">+ Add ad spend</button></div>
          <datalist id="ad-channels">{adChannels.map((c) => <option key={c} value={c} />)}</datalist>
        </form>
        {adSpend.length > 0 && (
          <table className="table mt-4">
            <thead><tr><th>Date</th><th>Channel</th><th>Campaign</th><th className="text-right">Clicks</th><th className="text-right">Cost</th><th /></tr></thead>
            <tbody>
              {adSpend.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap">{fmtDate(a.date)}</td>
                  <td>{a.channel}</td>
                  <td>{a.campaign === a.channel ? "" : a.campaign}</td>
                  <td className="text-right tabular-nums">{a.clicks || ""}</td>
                  <td className="text-right tabular-nums">{m(a.cost)}</td>
                  <td className="text-right">
                    <form action={deleteAdSpend}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="back" value={`${back}#ad-spend`} />
                      <ConfirmButton message={`Delete ${a.channel} spend of ${m(a.cost)}?`} className="text-sm text-charcoal-400 hover:text-kudu-600">Delete</ConfirmButton>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
