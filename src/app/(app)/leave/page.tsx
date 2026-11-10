import { LeaveType } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";
import { mayDecideOwn } from "@/lib/approval";
import { assignees } from "@/lib/assignees";
import { dayKey, fmtDate } from "@/lib/format";
import { dateOnly, fmtDays, fmtLeaveRange, LEAVE_STATUS_COLOURS, LEAVE_STATUS_LABELS, LEAVE_TYPE_LABELS, publicHolidays } from "@/lib/leave";
import { approveLeave, cancelLeave, declineLeave, requestLeave } from "@/app/actions/leave";
import { Empty, Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { DecideForms } from "@/components/Approvals";

export const metadata = { title: "Leave" };

const DAY = 86400000;

function Badge({ status }: { status: keyof typeof LEAVE_STATUS_LABELS }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${LEAVE_STATUS_COLOURS[status]}`}>{LEAVE_STATUS_LABELS[status]}</span>;
}

export default async function LeavePage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; year?: string }> }) {
  const user = await requirePermission("leave.request");
  const db = await tenantDb();
  const settings = await getSettings();
  const sp = await searchParams;
  const todayKey = dayKey(new Date());
  const today = dateOnly(todayKey)!;
  const year = Number(sp.year) || today.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const team = can(user, "leave.viewAll");
  const approver = can(user, "leave.approve");

  const [mine, upcoming, yearRows, people] = await Promise.all([
    db.leaveRequest.findMany({ where: { userId: user.id, OR: [{ endDate: { gte: yearStart } }, { status: "PENDING" }] }, orderBy: { startDate: "desc" } }),
    team
      ? db.leaveRequest.findMany({
          where: { status: { in: ["PENDING", "APPROVED"] }, endDate: { gte: today }, startDate: { lte: new Date(today.getTime() + 90 * DAY) } },
          include: { user: { select: { name: true, email: true } } },
          orderBy: { startDate: "asc" },
        })
      : [],
    team
      ? db.leaveRequest.groupBy({ by: ["userId", "type"], where: { status: "APPROVED", startDate: { gte: yearStart, lte: yearEnd } }, _sum: { days: true } })
      : [],
    team || approver ? assignees(db) : [],
  ]);
  const used = (rows: { type: LeaveType; status: string; startDate: Date; days: number }[], type: LeaveType, status = "APPROVED") =>
    rows.filter((r) => r.type === type && r.status === status && r.startDate >= yearStart && r.startDate <= yearEnd).reduce((s, r) => s + r.days, 0);
  const annualUsed = used(mine, "ANNUAL");
  const annualWaiting = used(mine, "ANNUAL", "PENDING");
  const holidays = [...publicHolidays(year)].filter(([d]) => d >= todayKey).sort().slice(0, 4);
  const sum = (userId: string, type: LeaveType) => yearRows.find((r) => r.userId === userId && r.type === type)?._sum.days ?? 0;

  return (
    <div className="max-w-5xl">
      <PageHeader title="Leave" subtitle="Request leave, see what you have left, and who is off when." />
      <Flash message={sp.msg} />
      <Flash message={sp.err} tone="error" />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card border-l-4 border-l-kudu-600 p-5">
          <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Annual leave left in {year}</div>
          <div className="mt-1 text-2xl font-bold">{fmtDays(Math.max(0, settings.annualLeaveDays - annualUsed))}</div>
          <div className="text-sm text-charcoal-500">
            {fmtDays(annualUsed)} taken or booked of {settings.annualLeaveDays}
            {annualWaiting > 0 && `, ${fmtDays(annualWaiting)} waiting for approval`}
          </div>
        </div>
        <div className="card p-5">
          <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Sick leave in {year}</div>
          <div className="mt-1 text-2xl font-bold">{fmtDays(used(mine, "SICK"))}</div>
          <div className="text-sm text-charcoal-500">Family responsibility: {fmtDays(used(mine, "FAMILY"))}</div>
        </div>
        <div className="card p-5 text-sm">
          <div className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Next public holidays</div>
          <ul className="mt-1 space-y-0.5">
            {holidays.map(([d, name]) => <li key={d}>{fmtLeaveRange(dateOnly(d)!, dateOnly(d)!)} · {name}</li>)}
            {!holidays.length && <li className="text-charcoal-500">None left this year</li>}
          </ul>
        </div>
      </div>

      <form action={requestLeave} className="card mb-6 p-5">
        <SectionTitle>Request leave</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {approver && (
            <Field label="For" className="lg:col-span-4">
              <select name="userId" defaultValue={user.id} className="input">
                <option value={user.id}>Me</option>
                {people.filter((p) => p.id !== user.id).map((p) => <option key={p.id} value={p.id}>{p.name} (recorded as approved)</option>)}
              </select>
            </Field>
          )}
          <Field label="Type">
            <select name="type" className="input" defaultValue="ANNUAL">
              {(Object.keys(LEAVE_TYPE_LABELS) as LeaveType[]).map((t) => <option key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="First day *"><input type="date" name="startDate" required className="input" defaultValue={todayKey} /></Field>
          <Field label="Last day"><input type="date" name="endDate" className="input" /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" name="halfDay" className="h-4 w-4 accent-kudu-600" /> Half day (one day only)
          </label>
          <Field label="Reason or note" className="lg:col-span-4"><input name="reason" className="input" placeholder="Optional, e.g. family wedding" /></Field>
        </div>
        <button className="btn-primary mt-4">Request leave</button>
        <p className="mt-2 text-xs text-charcoal-500">Days are counted as working days, Monday to Friday, without South African public holidays. Your manager approves it in Approvals.</p>
      </form>

      <div className="card mb-6 overflow-x-auto p-5">
        <SectionTitle>My leave</SectionTitle>
        {mine.length === 0 ? (
          <Empty>No leave booked in {year}.</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>When</th><th>Type</th><th className="text-right">Days</th><th>Status</th><th /></tr></thead>
            <tbody>
              {mine.map((l) => (
                <tr key={l.id}>
                  <td className="whitespace-nowrap">{fmtLeaveRange(l.startDate, l.endDate, l.halfDay)}{l.reason && <div className="text-xs text-charcoal-500">{l.reason}</div>}</td>
                  <td>{LEAVE_TYPE_LABELS[l.type]}</td>
                  <td className="text-right tabular-nums">{l.days}</td>
                  <td>
                    <Badge status={l.status} />
                    {l.decidedBy && l.status !== "CANCELLED" && <div className="text-xs text-charcoal-500">by {l.decidedBy}{l.decidedAt && `, ${fmtDate(l.decidedAt)}`}</div>}
                    {l.status === "DECLINED" && l.decisionNote && <div className="text-xs text-kudu-700">{l.decisionNote}</div>}
                  </td>
                  <td className="text-right">
                    {(l.status === "PENDING" || (l.status === "APPROVED" && l.startDate > today)) && (
                      <form action={cancelLeave}>
                        <input type="hidden" name="id" value={l.id} />
                        <ConfirmButton message="Cancel this leave?" className="text-sm text-charcoal-400 hover:text-kudu-600">Cancel</ConfirmButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {team && (
        <>
          <div className="card mb-6 overflow-x-auto p-5">
            <SectionTitle>Who is off (next 90 days)</SectionTitle>
            {upcoming.length === 0 ? (
              <Empty>Nobody has leave booked.</Empty>
            ) : (
              <table className="table">
                <thead><tr><th>Who</th><th>When</th><th>Type</th><th className="text-right">Days</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {upcoming.map((l) => {
                    const onNow = l.startDate <= today && l.endDate >= today && l.status === "APPROVED";
                    return (
                      <tr key={l.id} className={onNow ? "bg-emerald-50/50" : ""}>
                        <td className="font-medium">{l.user.name || l.user.email}{onNow && <div className="text-xs font-normal text-emerald-700">Off today</div>}</td>
                        <td className="whitespace-nowrap">{fmtLeaveRange(l.startDate, l.endDate, l.halfDay)}{l.reason && <div className="text-xs text-charcoal-500">{l.reason}</div>}</td>
                        <td>{LEAVE_TYPE_LABELS[l.type]}</td>
                        <td className="text-right tabular-nums">{l.days}</td>
                        <td><Badge status={l.status} /></td>
                        <td className="min-w-56 text-right">
                          {approver && l.status === "PENDING" && (l.userId !== user.id || mayDecideOwn(user)) && (
                            <DecideForms id={l.id} approve={approveLeave} reject={declineLeave} returnTo="/leave" rejectLabel="Decline" />
                          )}
                          {approver && l.status === "APPROVED" && (
                            <form action={cancelLeave}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="returnTo" value="/leave" />
                              <ConfirmButton message={`Cancel this leave for ${l.user.name || l.user.email}?`} className="text-sm text-charcoal-400 hover:text-kudu-600">Cancel</ConfirmButton>
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

          <div className="card overflow-x-auto p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <SectionTitle>Leave taken in {year}</SectionTitle>
              <form className="flex items-center gap-2 text-sm">
                <select name="year" defaultValue={year} className="input w-auto py-1">
                  {[year - 1, year, year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <button className="btn-outline py-1">Show</button>
              </form>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Who</th>
                  <th className="text-right">Annual (of {settings.annualLeaveDays})</th>
                  <th className="text-right">Sick</th>
                  <th className="text-right">Family</th>
                  <th className="text-right">Other</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className={`text-right tabular-nums ${sum(p.id, "ANNUAL") > settings.annualLeaveDays ? "font-semibold text-kudu-700" : ""}`}>{sum(p.id, "ANNUAL")}</td>
                    <td className="text-right tabular-nums">{sum(p.id, "SICK")}</td>
                    <td className="text-right tabular-nums">{sum(p.id, "FAMILY")}</td>
                    <td className="text-right tabular-nums">{sum(p.id, "STUDY") + sum(p.id, "UNPAID") + sum(p.id, "OTHER")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-charcoal-500">Approved leave, counted in the year it starts. Sick leave under the BCEA runs in 3-year cycles, so check longer periods in your payroll system.</p>
          </div>
        </>
      )}
    </div>
  );
}
