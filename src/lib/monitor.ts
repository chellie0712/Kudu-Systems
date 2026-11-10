// Process monitor: where each job is in its process, how long it has been there, which jobs are
// stuck, how long each step takes on average, and the other processes that are waiting on someone.
// Reads the job status history (JobStatusChange, written by src/lib/statusLog.ts).
import type { JobCardStatus, PrismaClient, Settings } from "@prisma/client";
import { stageLabel } from "./jobStatus";
import { OPEN_STATUSES, overdueBefore } from "./queries";

const DAY = 86400000;
export const days = (ms: number) => ms / DAY;

/** "3.5 days", "5 hours", "20 min": a duration in the unit that reads best. */
export function fmtDuration(ms: number): string {
  if (ms < 3600000) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (ms < DAY) return `${Math.round(ms / 3600000)} h`;
  const d = ms / DAY;
  return `${d < 10 ? d.toFixed(1).replace(/\.0$/, "") : Math.round(d)} day${d >= 1 && d < 1.05 ? "" : "s"}`;
}

export type OpenJob = {
  id: string;
  number: string;
  customer: string;
  customerId: string;
  technician: string;
  status: JobCardStatus;
  statusKey: string; // stage or custom status id: one column of the pipeline
  statusName: string;
  colour: string | null;
  scheduledStart: Date | null;
  since: Date;
  /** True when the job changed status before history was recorded, so `since` is a lower bound. */
  approx: boolean;
  stuck: string | null; // why it is stuck, or null
};

export type Column = { key: string; name: string; stage: JobCardStatus; colour: string | null; jobs: OpenJob[]; stuck: number; avgMs: number; oldestMs: number };
export type StepStat = { name: string; count: number; avgMs: number; medianMs: number; maxMs: number };

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Open jobs (Scheduled and In progress, including custom statuses), each with how long it has been in its status and whether it is stuck. */
export async function openJobs(db: PrismaClient, settings: Settings, branchId: string | null, now = new Date()): Promise<OpenJob[]> {
  const rows = await db.jobCard.findMany({
    where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, ...(branchId ? { customer: { branchId } } : {}) },
    select: {
      id: true,
      number: true,
      status: true,
      statusId: true,
      createdAt: true,
      updatedAt: true,
      scheduledStart: true,
      technician: true,
      technicianId: true,
      customer: { select: { id: true, name: true } },
      technicianUser: { select: { name: true, email: true } },
      customStatus: { select: { name: true, colour: true, stuckAfterDays: true } },
      statusChanges: { orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true } },
    },
  });
  return rows.map((j) => {
    const last = j.statusChanges[0]?.changedAt;
    const tracked = j.createdAt >= settings.statusTrackingSince;
    // No history: a new job has been in its status since it was created. An older job may have
    // changed status before tracking began, so its last edit is the best lower bound.
    const since = last ?? (tracked || j.status === "SCHEDULED" ? j.createdAt : j.updatedAt);
    const approx = !last && !tracked && j.status !== "SCHEDULED";
    const inStatus = now.getTime() - since.getTime();
    const limitDays = j.customStatus?.stuckAfterDays ?? settings.jobStuckDays;
    let stuck: string | null = null;
    if (j.status === "SCHEDULED") {
      if (j.scheduledStart && j.scheduledStart.getTime() < now.getTime() - DAY) stuck = `Due to start ${Math.floor(days(now.getTime() - j.scheduledStart.getTime()))} days ago, not started`;
      else if (!j.scheduledStart && days(inStatus) > settings.jobStuckDays) stuck = `Not booked in for ${Math.floor(days(inStatus))} days`;
      else if (j.scheduledStart && !j.technicianId && j.scheduledStart.getTime() < now.getTime() + 2 * DAY) stuck = "Starts within 2 days, nobody assigned";
    } else if (days(inStatus) > limitDays) {
      stuck = `${Math.floor(days(inStatus))} days in ${j.customStatus?.name ?? stageLabel(j.status)} (limit ${limitDays})`;
    }
    return {
      id: j.id,
      number: j.number,
      customer: j.customer.name,
      customerId: j.customer.id,
      technician: j.technicianUser?.name || j.technicianUser?.email || j.technician,
      status: j.status,
      statusKey: j.statusId ?? j.status,
      statusName: j.customStatus?.name ?? stageLabel(j.status),
      colour: j.customStatus?.colour ?? null,
      scheduledStart: j.scheduledStart,
      since,
      approx,
      stuck,
    };
  });
}

/** The open jobs as pipeline columns, in process order: Scheduled, its custom statuses, In progress, its custom statuses. */
export async function pipeline(db: PrismaClient, jobs: OpenJob[], now = new Date()): Promise<Column[]> {
  const customs = await db.jobStatus.findMany({
    where: { stage: { in: ["SCHEDULED", "IN_PROGRESS"] }, OR: [{ active: true }, { id: { in: jobs.map((j) => j.statusKey) } }] },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const order: { key: string; name: string; stage: JobCardStatus; colour: string | null }[] = [];
  for (const stage of ["SCHEDULED", "IN_PROGRESS"] as const) {
    order.push({ key: stage, name: stageLabel(stage), stage, colour: null });
    for (const c of customs.filter((c) => c.stage === stage)) order.push({ key: c.id, name: c.name, stage, colour: c.colour });
  }
  return order.map((o) => {
    const js = jobs.filter((j) => j.statusKey === o.key).sort((a, b) => a.since.getTime() - b.since.getTime());
    const ages = js.map((j) => now.getTime() - j.since.getTime());
    return { ...o, jobs: js, stuck: js.filter((j) => j.stuck).length, avgMs: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : 0, oldestMs: ages[0] ?? 0 };
  });
}

/**
 * How long jobs spent in each status, for status changes in the period. Only time recorded by the
 * history counts: the first step of a job created before tracking began is left out.
 */
export async function stepTimes(db: PrismaClient, settings: Settings, from: Date, to: Date, branchId: string | null) {
  const changes = await db.jobStatusChange.findMany({
    where: { changedAt: { gte: from, lte: to }, ...(branchId ? { jobCard: { customer: { branchId } } } : {}) },
    orderBy: { changedAt: "asc" },
    select: { jobCardId: true, fromStatus: true, fromName: true, toStatus: true, changedAt: true, jobCard: { select: { createdAt: true } } },
  });
  // The change before each one (possibly before the period) tells when the step started.
  const jobIds = [...new Set(changes.map((c) => c.jobCardId))];
  const all = jobIds.length
    ? await db.jobStatusChange.findMany({ where: { jobCardId: { in: jobIds }, changedAt: { lte: to } }, orderBy: { changedAt: "asc" }, select: { jobCardId: true, changedAt: true } })
    : [];
  const byJob = new Map<string, Date[]>();
  for (const c of all) byJob.set(c.jobCardId, [...(byJob.get(c.jobCardId) ?? []), c.changedAt]);

  const spans = new Map<string, number[]>();
  const leadTimes: number[] = [];
  for (const c of changes) {
    if (c.toStatus === "COMPLETED" && c.fromStatus !== "COMPLETED") leadTimes.push(c.changedAt.getTime() - c.jobCard.createdAt.getTime());
    if (!c.fromStatus) continue; // creation
    const times = byJob.get(c.jobCardId) ?? [];
    const prev = [...times].reverse().find((t) => t < c.changedAt);
    const start = prev ?? (c.jobCard.createdAt >= settings.statusTrackingSince ? c.jobCard.createdAt : null);
    if (!start) continue;
    const name = c.fromName || stageLabel(c.fromStatus);
    spans.set(name, [...(spans.get(name) ?? []), c.changedAt.getTime() - start.getTime()]);
  }
  const steps: StepStat[] = [...spans.entries()]
    .map(([name, xs]) => ({ name, count: xs.length, avgMs: xs.reduce((a, b) => a + b, 0) / xs.length, medianMs: median(xs), maxMs: Math.max(...xs) }))
    .sort((a, b) => b.avgMs - a.avgMs);
  return {
    steps,
    completed: leadTimes.length,
    leadAvgMs: leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0,
    leadMedianMs: median(leadTimes),
    changes: changes.length,
  };
}

/** Other processes waiting on someone: completed jobs not invoiced, unanswered and unactioned quotes, invoices awaiting approval or overdue, overdue queries. */
export async function waitingProcesses(db: PrismaClient, settings: Settings, branchId: string | null, now = new Date()) {
  const ofBranch = branchId ? { customer: { branchId } } : {};
  const [completed, quotes, accepted, approvals, overdueInvoices, overdueQueries] = await Promise.all([
    db.jobCard.findMany({
      where: { status: "COMPLETED", invoices: { none: { status: { not: "CANCELLED" } } }, ...ofBranch },
      select: {
        id: true,
        number: true,
        signedAt: true,
        updatedAt: true,
        customer: { select: { name: true } },
        statusChanges: { where: { toStatus: "COMPLETED" }, orderBy: { changedAt: "desc" }, take: 1, select: { changedAt: true } },
      },
    }),
    db.quotation.findMany({
      where: { status: "SENT", response: "", issueDate: { lt: new Date(now.getTime() - settings.quoteFollowUpDays * DAY) }, ...ofBranch },
      select: { id: true, number: true, issueDate: true, total: true, customer: { select: { name: true } } },
      orderBy: { issueDate: "asc" },
    }),
    db.quotation.findMany({
      where: { status: "ACCEPTED", jobCards: { none: {} }, invoices: { none: {} }, ...ofBranch },
      select: { id: true, number: true, updatedAt: true, total: true, customer: { select: { name: true } } },
      orderBy: { updatedAt: "asc" },
    }),
    db.invoice.findMany({
      where: { approvalRequestedAt: { not: null }, approvedAt: null, status: { not: "CANCELLED" }, ...ofBranch },
      select: { id: true, number: true, approvalRequestedAt: true, total: true, customer: { select: { name: true } } },
      orderBy: { approvalRequestedAt: "asc" },
    }),
    db.invoice.findMany({
      where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: now }, ...ofBranch },
      select: { id: true, number: true, dueDate: true, total: true, amountPaid: true, customer: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
    }),
    db.query.findMany({
      where: { status: { in: OPEN_STATUSES }, dueAt: { lt: overdueBefore(now) }, ...ofBranch },
      select: { id: true, number: true, subject: true, dueAt: true, customer: { select: { name: true } } },
      orderBy: { dueAt: "asc" },
    }),
  ]);
  const notInvoiced = completed
    .map((j) => ({ ...j, completedAt: j.statusChanges[0]?.changedAt ?? j.signedAt ?? j.updatedAt }))
    .filter((j) => j.completedAt.getTime() < now.getTime() - settings.invoiceAfterDays * DAY)
    .sort((a, b) => a.completedAt.getTime() - b.completedAt.getTime());
  return { notInvoiced, quotes, accepted, approvals, overdueInvoices, overdueQueries };
}
