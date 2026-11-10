// Runs workflows (see ./defs.ts for the building blocks).
//
// Events: something in Kudu calls emit() (./events.ts) → fireEvent() finds the switched-on workflows
// for that trigger → checks the conditions → acts now, or stores a WAITING run when the workflow
// waits first. Timed triggers ("overdue by 7 days") are found by scanTimed(), which the daily job and
// the "Check now" button call; it records one run per thing per workflow (dedupeKey).
// Waiting runs are finished by processDue() (daily job, and pages on load).
//
// Loops: actions run inside a chain counter. A workflow started by another workflow's action is one
// level deeper; at MAX_DEPTH nothing more starts, so "A changes status → B changes it back" stops.
import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, type PrismaClient, type Workflow, type WorkflowRun, JobCardStatus, QuotationStatus } from "@prisma/client";
import { addDays, fmtDate, money } from "@/lib/format";
import { nextNumberIn } from "@/lib/settings";
import { autoAssign } from "@/lib/tasks";
import { logStatusChange, statusName } from "@/lib/statusLog";
import { CUSTOM_PREFIX } from "@/lib/jobStatus";
import { buildMime } from "@/lib/email/mime";
import { sendRaw } from "@/lib/email/providers";
import { rotateSecret } from "@/lib/email/sender";
import { invoiceFromJobCard, jobCardFromQuote } from "@/lib/conversions";
import {
  ACTIONS,
  FIELDS,
  INVOICE_STATUSES,
  QUERY_STATUSES,
  QUOTE_STATUSES,
  parseActions,
  parseConditions,
  parseTriggerConfig,
  triggerDef,
  type Condition,
  type Subject,
  type TriggerKey,
  type WorkflowAction,
} from "./defs";
import { emit, type EventInfo } from "./events";

const MAX_DEPTH = 3;
const chain = new AsyncLocalStorage<{ depth: number }>();
const currentDepth = () => chain.getStore()?.depth ?? 0;

type Value = string | number | null | string[];

/** Everything a workflow needs to know about the thing it runs for. */
export type Context = {
  subject: Subject;
  id: string;
  label: string;
  link: string; // path in Kudu
  customerId: string | null;
  customerEmail: string;
  technicianId: string | null;
  assigneeId: string | null;
  /** Status keys it is in now (a job: its custom status and its stage). */
  statusKeys: string[];
  values: Record<string, Value>;
  vars: Record<string, string>;
  /** Fields to link a created task to it. */
  taskLink: Partial<Record<"customerId" | "jobCardId" | "quotationId" | "invoiceId" | "queryId", string>>;
};

export type LogEntry = { action: string; ok: boolean; message: string; link?: string };

async function baseUrl(): Promise<string> {
  try {
    const { siteUrl } = await import("@/lib/email/links");
    return await siteUrl();
  } catch {
    const v = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
    return v ? (v.startsWith("http") ? v : `https://${v}`).replace(/\/$/, "") : "";
  }
}

const customerSelect = { id: true, name: true, type: true, email: true, contactPerson: true, leadSource: true, branchId: true } as const;
type CustomerBits = { id: string; name: string; type: string; email: string; contactPerson: string; leadSource: string; branchId: string | null };

function customerParts(c: CustomerBits) {
  return {
    values: { "customer.type": c.type, "customer.name": c.name, "customer.leadSource": c.leadSource, "customer.branch": c.branchId, "customer.email": c.email } as Record<string, Value>,
    vars: { customer: c.name, contact: c.contactPerson || c.name },
  };
}

/** Loads the thing a workflow runs for. Null when it has been deleted since. */
export async function loadContext(db: PrismaClient, subject: Subject, id: string, extra: Record<string, string> = {}): Promise<Context | null> {
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { companyName: true } });
  const base = await baseUrl();
  const finish = (c: Omit<Context, "vars"> & { vars: Record<string, string> }): Context => ({
    ...c,
    vars: { company: settings?.companyName ?? "", days: "", ...c.vars, link: `${base}${c.link}`, ...extra },
  });
  switch (subject) {
    case "customer": {
      const c = await db.customer.findUnique({ where: { id }, select: customerSelect });
      if (!c) return null;
      const p = customerParts(c);
      return finish({
        subject, id, label: c.name, link: `/customers/${id}`, customerId: id, customerEmail: c.email, technicianId: null, assigneeId: null, statusKeys: [],
        values: p.values, vars: { ...p.vars, number: c.name, date: "" }, taskLink: { customerId: id },
      });
    }
    case "quote": {
      const q = await db.quotation.findUnique({ where: { id }, include: { customer: { select: customerSelect } } });
      if (!q) return null;
      const p = customerParts(q.customer);
      return finish({
        subject, id, label: `${q.number} · ${q.customer.name}`, link: `/quotations/${id}`, customerId: q.customerId, customerEmail: q.customer.email,
        technicianId: null, assigneeId: null, statusKeys: [q.status],
        values: { ...p.values, "quote.total": q.total, "quote.title": q.title, "quote.status": q.status },
        vars: { ...p.vars, number: q.number, title: q.title, total: money(q.total), status: QUOTE_STATUSES[q.status], date: fmtDate(q.issueDate) },
        taskLink: { customerId: q.customerId, quotationId: id },
      });
    }
    case "job": {
      const j = await db.jobCard.findUnique({
        where: { id },
        include: { customer: { select: customerSelect }, technicianUser: { select: { name: true, email: true } } },
      });
      if (!j) return null;
      const p = customerParts(j.customer);
      const keys = [j.statusId ? `${CUSTOM_PREFIX}${j.statusId}` : "", j.status].filter(Boolean);
      return finish({
        subject, id, label: `${j.number} · ${j.customer.name}`, link: `/job-cards/${id}`, customerId: j.customerId, customerEmail: j.customer.email,
        technicianId: j.technicianId, assigneeId: j.technicianId, statusKeys: keys,
        values: {
          ...p.values,
          "job.status": keys,
          "job.jobType": j.jobType,
          "job.priority": j.priority,
          "job.technician": j.technicianId,
          "job.rating": j.customerRating,
          "job.feedback": j.customerFeedback,
        },
        vars: {
          ...p.vars,
          number: j.number,
          status: await statusName(db, { status: j.status, statusId: j.statusId }),
          technician: j.technicianUser?.name || j.technician || "our technician",
          date: fmtDate(extra.date === "warranty" ? j.warrantyEnd : j.jobDate ?? j.scheduledStart),
          rating: j.customerRating ? String(j.customerRating) : "",
          feedback: j.customerFeedback || "(none)",
          title: j.jobType,
        },
        taskLink: { customerId: j.customerId, jobCardId: id },
      });
    }
    case "invoice": {
      const inv = await db.invoice.findUnique({ where: { id }, include: { customer: { select: customerSelect } } });
      if (!inv) return null;
      const p = customerParts(inv.customer);
      const balance = Math.max(0, inv.total - inv.amountPaid);
      return finish({
        subject, id, label: `${inv.number} · ${inv.customer.name}`, link: `/invoices/${id}`, customerId: inv.customerId, customerEmail: inv.customer.email,
        technicianId: null, assigneeId: null, statusKeys: [inv.status],
        values: { ...p.values, "invoice.total": inv.total, "invoice.balance": balance, "invoice.status": inv.status },
        vars: { ...p.vars, number: inv.number, total: money(inv.total), balance: money(balance), status: INVOICE_STATUSES[inv.status], date: fmtDate(inv.dueDate) },
        taskLink: { customerId: inv.customerId, invoiceId: id },
      });
    }
    case "query": {
      const q = await db.query.findUnique({ where: { id }, include: { customer: { select: customerSelect } } });
      if (!q) return null;
      const p = customerParts(q.customer);
      return finish({
        subject, id, label: `${q.number} · ${q.customer.name}`, link: `/queries/${id}`, customerId: q.customerId, customerEmail: q.customer.email,
        technicianId: null, assigneeId: q.assignedToId, statusKeys: [q.status],
        values: { ...p.values, "query.category": q.category, "query.source": q.source, "query.priority": q.priority, "query.status": q.status },
        vars: { ...p.vars, number: q.number, title: q.subject, status: QUERY_STATUSES[q.status], date: fmtDate(q.createdAt) },
        taskLink: { customerId: q.customerId, queryId: id },
      });
    }
    case "submission": {
      const s = await db.formSubmission.findUnique({ where: { id }, include: { form: { select: { name: true } }, customer: { select: customerSelect } } });
      if (!s) return null;
      const p = s.customer ? customerParts(s.customer) : { values: {}, vars: { customer: s.summary || "someone", contact: s.summary || "" } };
      return finish({
        subject, id, label: `${s.form.name}${s.summary ? `: ${s.summary}` : ""}`, link: `/forms/submissions/${id}`, customerId: s.customerId, customerEmail: s.customer?.email ?? "",
        technicianId: null, assigneeId: s.submittedById, statusKeys: [],
        values: { ...p.values, "submission.form": s.formId, "submission.source": s.source },
        vars: { ...p.vars, form: s.form.name, number: s.form.name, title: s.summary, date: fmtDate(s.createdAt) },
        taskLink: { ...(s.customerId ? { customerId: s.customerId } : {}), ...(s.jobCardId ? { jobCardId: s.jobCardId } : {}) },
      });
    }
  }
}

// ---------- Conditions ----------

function test(c: Condition, v: Value): boolean {
  const def = FIELDS[c.field];
  const values = Array.isArray(v) ? v : [v];
  const isEmpty = values.every((x) => x === null || x === "");
  if (c.op === "empty") return isEmpty;
  if (c.op === "notEmpty") return !isEmpty;
  if (def.kind === "money" || def.kind === "number") {
    const n = typeof v === "number" ? v : Number(v);
    if (v === null || Number.isNaN(n)) return c.op === "ne";
    const want = def.kind === "money" ? Math.round(Number(c.value.replace(/[^\d.-]/g, "")) * 100) : Number(c.value);
    return c.op === "eq" ? n === want : c.op === "ne" ? n !== want : c.op === "gt" ? n > want : c.op === "lt" ? n < want : false;
  }
  const want = c.value.trim().toLowerCase();
  const has = values.map((x) => String(x ?? "").trim().toLowerCase());
  if (c.op === "eq") return has.includes(want);
  if (c.op === "ne") return !has.includes(want);
  if (c.op === "contains") return has.some((x) => x.includes(want));
  return false;
}

/** The first condition that does not hold, or null when they all do. */
export function failedCondition(conditions: Condition[], ctx: Context): Condition | null {
  return conditions.find((c) => !test(c, ctx.values[c.field] ?? null)) ?? null;
}

export const merge = (text: string, vars: Record<string, string>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));

// ---------- Starting runs ----------

function statusMatches(want: string, info: EventInfo): boolean {
  if (!want) return true;
  const got = Array.isArray(info.status) ? info.status : info.status ? [info.status] : [];
  return got.includes(want);
}

/** Called by emit(). */
export async function fireEvent(db: PrismaClient, trigger: TriggerKey, subjectId: string, info: EventInfo) {
  const depth = currentDepth();
  if (depth >= MAX_DEPTH) return;
  const flows = await db.workflow.findMany({ where: { active: true, trigger } });
  for (const wf of flows) {
    const cfg = parseTriggerConfig(wf.triggerConfig);
    if (!statusMatches(cfg.status, info)) continue;
    if (cfg.formId && info.formId !== cfg.formId) continue;
    try {
      await startRun(db, wf, subjectId, { depth });
    } catch (e) {
      console.error(`Workflow "${wf.name}" failed`, e);
    }
  }
}

type StartOpts = { depth: number; dedupeKey?: string; extra?: Record<string, string>; manual?: boolean };

/** Checks the conditions and acts now, or stores a waiting run. Returns the run, or null when it already ran (timed). */
export async function startRun(db: PrismaClient, wf: Workflow, subjectId: string, opts: StartOpts): Promise<WorkflowRun | null> {
  const def = triggerDef(wf.trigger);
  if (!def) return null;
  if (wf.oncePer && (await db.workflowRun.findFirst({ where: { workflowId: wf.id, subjectId, status: { in: ["WAITING", "RUNNING", "DONE", "FAILED"] } }, select: { id: true } }))) {
    return null; // already done (or under way) for this one
  }
  const ctx = await loadContext(db, def.subject, subjectId, opts.extra);
  if (!ctx) return null;
  const failed = failedCondition(parseConditions(wf.conditions), ctx);
  const waiting = !failed && wf.waitMinutes > 0;
  let run: WorkflowRun;
  try {
    run = await db.workflowRun.create({
      data: {
        workflowId: wf.id,
        subjectId,
        label: ctx.label.slice(0, 200),
        link: ctx.link,
        status: failed ? "SKIPPED" : waiting ? "WAITING" : "RUNNING",
        runAt: waiting ? new Date(Date.now() + wf.waitMinutes * 60000) : null,
        depth: opts.depth,
        dedupeKey: opts.dedupeKey ?? null,
        finishedAt: failed ? new Date() : null,
        log: failed ? [skipEntry(failed)] : [],
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; // timed: already done for this one
    throw e;
  }
  if (failed || waiting) return run;
  return execute(db, wf, run, ctx);
}

function skipEntry(c: Condition): LogEntry {
  const f = FIELDS[c.field];
  return { action: "Conditions", ok: true, message: `Not done: “${f?.label ?? c.field}” did not match.` };
}

/** Does the workflow's actions for one run. */
async function execute(db: PrismaClient, wf: Workflow, run: WorkflowRun, ctx: Context): Promise<WorkflowRun> {
  const actions = parseActions(wf.actions);
  const log: LogEntry[] = [];
  await chain.run({ depth: run.depth + 1 }, async () => {
    for (const a of actions) {
      try {
        log.push(await doAction(db, wf, a, ctx));
      } catch (e) {
        log.push({ action: ACTIONS[a.type].label, ok: false, message: e instanceof Error ? e.message.slice(0, 500) : String(e) });
      }
    }
  });
  const ok = log.every((l) => l.ok);
  const [done] = await db.$transaction([
    db.workflowRun.update({ where: { id: run.id }, data: { status: ok ? "DONE" : "FAILED", log, finishedAt: new Date() } }),
    db.workflow.update({ where: { id: wf.id }, data: { runCount: { increment: 1 }, lastRunAt: new Date() } }),
  ]);
  return done;
}

// ---------- Actions ----------

async function doAction(db: PrismaClient, wf: Workflow, a: WorkflowAction, ctx: Context): Promise<LogEntry> {
  const label = ACTIONS[a.type].label;
  const by = `Workflow: ${wf.name}`.slice(0, 120);
  const subjectOnly = (s: Subject) => {
    if (ctx.subject !== s) throw new Error(`Only works for a ${s}`);
  };
  switch (a.type) {
    case "task": {
      const title = merge(a.title || `${wf.name}: {customer}`, ctx.vars).slice(0, 200);
      const category = a.category;
      let assignedToId: string | null = null;
      let assignedBy = "";
      if (a.assign === "rules") {
        const picked = await autoAssign(db, { category, priority: a.priority, customerId: ctx.customerId });
        if (picked) [assignedToId, assignedBy] = [picked.userId, `Rule: ${picked.ruleName}`];
      } else if (a.assign === "technician" || a.assign === "owner") {
        assignedToId = a.assign === "technician" ? ctx.technicianId : ctx.assigneeId;
        assignedBy = by;
      } else if (a.assign.startsWith("user:")) {
        assignedToId = a.assign.slice(5);
        assignedBy = by;
      }
      if (assignedToId && !(await db.user.findFirst({ where: { id: assignedToId, disabled: false }, select: { id: true } }))) assignedToId = null;
      const t = await db.task.create({
        data: {
          number: await nextNumberIn(db, "task"),
          title,
          description: merge(a.body, ctx.vars).slice(0, 5000),
          category,
          priority: a.priority,
          dueAt: new Date(Date.now() + a.dueHours * 3600000),
          assignedToId,
          assignedBy: assignedToId ? assignedBy : "",
          ...ctx.taskLink,
          createdBy: by,
          notes: { create: { text: `Added by the workflow “${wf.name}”${assignedToId ? "" : " (nobody assigned)"}`, system: true, userName: "Kudu" } },
        },
        include: { assignedTo: { select: { name: true } } },
      });
      return { action: label, ok: true, message: `${t.number} “${t.title}”${t.assignedTo ? ` for ${t.assignedTo.name}` : ", not assigned"}`, link: `/tasks/${t.id}` };
    }
    case "email": {
      if (!a.from) throw new Error("No mailbox chosen to send from");
      const account = await db.mailAccount.findUnique({ where: { userId: a.from }, include: { user: { select: { name: true, disabled: true } } } });
      if (!account || account.user.disabled) throw new Error("The chosen person has no connected mailbox");
      let to = "";
      if (a.to === "customer") to = ctx.customerEmail;
      else {
        const uid = a.to === "technician" ? ctx.technicianId : a.to.startsWith("user:") ? a.to.slice(5) : null;
        to = uid ? (await db.user.findUnique({ where: { id: uid }, select: { email: true } }))?.email ?? "" : "";
      }
      if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { action: label, ok: true, message: "Not sent: no email address to send to." };
      const subject = merge(a.title, ctx.vars).slice(0, 250) || wf.name;
      const text = merge(a.body, ctx.vars);
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#222">${esc(text).replace(/\n/g, "<br>")}</div>`;
      const raw = buildMime({
        from: { email: account.email, name: account.fromName || account.user.name || undefined },
        to: { email: to, name: a.to === "customer" ? ctx.vars.contact : "" },
        subject,
        text,
        html,
        headers: { "X-Mailer": "Kudu CRM", "Auto-Submitted": "auto-generated" },
      });
      await sendRaw(account, raw, to, rotateSecret(db, account.id));
      await db.mailAccount.update({ where: { id: account.id }, data: { lastUsedAt: new Date(), lastError: "" } });
      return { action: label, ok: true, message: `Sent “${subject}” to ${to} from ${account.email}` };
    }
    case "query": {
      if (!ctx.customerId) return { action: label, ok: true, message: "Not logged: there is no customer to log it for." };
      const q = await db.query.create({
        data: {
          number: await nextNumberIn(db, "query"),
          customerId: ctx.customerId,
          subject: (merge(a.title, ctx.vars) || wf.name).slice(0, 200),
          description: merge(a.body, ctx.vars).slice(0, 5000),
          category: a.category,
          priority: a.priority,
          source: "Workflow",
          jobCardId: ctx.taskLink.jobCardId ?? null,
          createdBy: by,
          notes: { create: { text: `Logged by the workflow “${wf.name}”`, system: true, userName: "Kudu" } },
        },
      });
      await emit(db, "query.created", q.id);
      return { action: label, ok: true, message: `${q.number} “${q.subject}”`, link: `/queries/${q.id}` };
    }
    case "jobStatus": {
      subjectOnly("job");
      const before = await db.jobCard.findUniqueOrThrow({ where: { id: ctx.id }, select: { status: true, statusId: true } });
      let after: { status: JobCardStatus; statusId: string | null };
      if (a.status.startsWith(CUSTOM_PREFIX)) {
        const s = await db.jobStatus.findUnique({ where: { id: a.status.slice(CUSTOM_PREFIX.length) } });
        if (!s) throw new Error("That status no longer exists");
        after = { status: s.stage, statusId: s.id };
      } else if (a.status in JobCardStatus) {
        after = { status: a.status as JobCardStatus, statusId: null };
      } else throw new Error("No status chosen");
      if (before.status === after.status && before.statusId === after.statusId) return { action: label, ok: true, message: "Already in that status." };
      await db.jobCard.update({ where: { id: ctx.id }, data: after });
      await logStatusChange(db, ctx.id, before, after, by);
      try {
        const { syncJobCardEvent } = await import("@/lib/jobCardCalendar");
        await syncJobCardEvent(ctx.id);
      } catch {
        // The calendar catches up the next time someone saves the job.
      }
      return { action: label, ok: true, message: `Now ${await statusName(db, after)}` };
    }
    case "quoteStatus": {
      subjectOnly("quote");
      if (!(a.status in QuotationStatus)) throw new Error("No status chosen");
      const status = a.status as QuotationStatus;
      const n = await db.quotation.updateMany({ where: { id: ctx.id, status: { not: status } }, data: { status } });
      if (!n.count) return { action: label, ok: true, message: "Already in that status." };
      await emit(db, "quote.status", ctx.id, { status });
      return { action: label, ok: true, message: `Now ${QUOTE_STATUSES[status]}` };
    }
    case "jobFromQuote": {
      subjectOnly("quote");
      const existing = await db.jobCard.findFirst({ where: { quotationId: ctx.id }, select: { id: true, number: true } });
      if (existing) return { action: label, ok: true, message: `Not made: ${existing.number} was already made from it.`, link: `/job-cards/${existing.id}` };
      const jc = await jobCardFromQuote(db, ctx.id, by);
      return { action: label, ok: true, message: `${jc.number} created`, link: `/job-cards/${jc.id}` };
    }
    case "makeDoc": {
      const t = await db.docTemplate.findFirst({ where: { id: a.templateId, active: true }, select: { appliesTo: true, name: true } });
      if (!t) throw new Error("The document template is missing or switched off");
      if (t.appliesTo !== ctx.subject) throw new Error(`“${t.name}” is made from a different kind of record`);
      const { generateDocument } = await import("@/lib/documents/data");
      const doc = await generateDocument(db, a.templateId, ctx.id, { name: by });
      return { action: label, ok: true, message: `${doc.name} ${doc.number} made`, link: `/documents/${doc.id}` };
    }
    case "webhook": {
      if (!a.webhookId) throw new Error("No webhook chosen");
      const { webhookFromWorkflow } = await import("@/lib/integrations/webhooks");
      const sent = await webhookFromWorkflow(db, a.webhookId, wf, ctx.id);
      return { action: label, ok: true, message: `Sent to “${sent.webhook}” (see Settings → API & webhooks for the answer)`, link: `/settings/api/webhooks/${a.webhookId}` };
    }
    case "invoiceFromJob": {
      subjectOnly("job");
      const existing = await db.invoice.findFirst({ where: { jobCardId: ctx.id, status: { not: "CANCELLED" } }, select: { id: true, number: true } });
      if (existing) return { action: label, ok: true, message: `Not made: ${existing.number} is already linked to it.`, link: `/invoices/${existing.id}` };
      const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
      const { invoice, itemCount } = await invoiceFromJobCard(db, ctx.id, settings);
      return { action: label, ok: true, message: `Draft ${invoice.number} created${itemCount ? "" : " with no lines (add them)"}`, link: `/invoices/${invoice.id}` };
    }
  }
}

// ---------- Waiting runs ----------

/** Finishes waiting runs that are due. Cheap when there are none, so pages call it on load. */
export async function processDue(db: PrismaClient, now = new Date(), limit = 25): Promise<number> {
  const due = await db.workflowRun.findMany({ where: { status: "WAITING", runAt: { lte: now } }, orderBy: { runAt: "asc" }, take: limit, include: { workflow: true } });
  let n = 0;
  for (const run of due) {
    const claimed = await db.workflowRun.updateMany({ where: { id: run.id, status: "WAITING" }, data: { status: "RUNNING" } });
    if (!claimed.count) continue;
    const wf = run.workflow;
    const end = (status: "CANCELLED" | "SKIPPED", message: string) =>
      db.workflowRun.update({ where: { id: run.id }, data: { status, finishedAt: new Date(), log: [{ action: "After waiting", ok: true, message }] } });
    try {
      if (!wf.active) {
        await end("CANCELLED", "The workflow was switched off while waiting.");
        continue;
      }
      const def = triggerDef(wf.trigger);
      const ctx = def ? await loadContext(db, def.subject, run.subjectId) : null;
      if (!ctx) {
        await end("CANCELLED", "It was deleted while waiting.");
        continue;
      }
      const cfg = parseTriggerConfig(wf.triggerConfig);
      if (def?.option?.endsWith("Status") && cfg.status && !ctx.statusKeys.includes(cfg.status)) {
        await end("SKIPPED", "Not done: its status changed while waiting.");
        continue;
      }
      const failed = failedCondition(parseConditions(wf.conditions), ctx);
      if (failed) {
        await db.workflowRun.update({ where: { id: run.id }, data: { status: "SKIPPED", finishedAt: new Date(), log: [skipEntry(failed)] } });
        continue;
      }
      await chain.run({ depth: run.depth }, () => execute(db, wf, run, ctx));
      n++;
    } catch (e) {
      await db.workflowRun.update({
        where: { id: run.id },
        data: { status: "FAILED", finishedAt: new Date(), log: [{ action: "Run", ok: false, message: e instanceof Error ? e.message.slice(0, 500) : String(e) }] },
      });
    }
  }
  return n;
}

// ---------- Timed triggers ----------

const DAY = 86400000;

/** Things that reached a timed workflow's point: [subject id, dedupe key, extra placeholders]. */
async function timedCandidates(db: PrismaClient, wf: Workflow, now: Date): Promise<[string, string, Record<string, string>][]> {
  const { days } = parseTriggerConfig(wf.triggerConfig);
  const since = wf.activeSince ?? wf.createdAt;
  const extra = { days: String(days) };
  // "After" triggers: the point (date + days) must be in the past, and reached after the workflow was switched on.
  const reachedBetween = { lte: new Date(now.getTime() - days * DAY), gte: new Date(since.getTime() - days * DAY) };
  const ahead = { gt: now, lte: new Date(now.getTime() + days * DAY) };
  switch (wf.trigger as TriggerKey) {
    case "quote.noReply": {
      const rows = await db.quotation.findMany({ where: { status: "SENT", response: "", issueDate: reachedBetween }, select: { id: true }, take: 200 });
      return rows.map((r) => [r.id, r.id, extra]);
    }
    case "invoice.overdue": {
      const rows = await db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: reachedBetween }, select: { id: true, total: true, amountPaid: true }, take: 200 });
      return rows.filter((r) => r.total > r.amountPaid).map((r) => [r.id, r.id, extra]);
    }
    case "job.upcoming": {
      const rows = await db.jobCard.findMany({ where: { status: "SCHEDULED", jobDate: ahead }, select: { id: true, jobDate: true }, take: 200 });
      return rows.map((r) => [r.id, `${r.id}:${r.jobDate!.toISOString().slice(0, 10)}`, extra]);
    }
    case "warranty.ending": {
      const rows = await db.jobCard.findMany({ where: { status: { not: "CANCELLED" }, warrantyEnd: ahead }, select: { id: true, warrantyEnd: true }, take: 200 });
      return rows.map((r) => [r.id, `${r.id}:${r.warrantyEnd!.toISOString().slice(0, 10)}`, { ...extra, date: "warranty" }]);
    }
    case "customer.noJob": {
      const last = await db.jobCard.groupBy({ by: ["customerId"], where: { status: "COMPLETED" }, _max: { jobDate: true, updatedAt: true } });
      const out: [string, string, Record<string, string>][] = [];
      for (const r of last) {
        const when = r._max.jobDate ?? r._max.updatedAt;
        if (!when) continue;
        const point = addDays(when, days);
        if (point > now || point < since) continue;
        out.push([r.customerId, `${r.customerId}:${when.toISOString().slice(0, 10)}`, { days: String(Math.floor((now.getTime() - when.getTime()) / DAY)) }]);
      }
      if (!out.length) return out;
      const live = new Set((await db.customer.findMany({ where: { id: { in: out.map((o) => o[0]) }, archived: false }, select: { id: true } })).map((c) => c.id));
      return out.filter((o) => live.has(o[0])).slice(0, 200);
    }
    default:
      return [];
  }
}

/** Checks every switched-on timed workflow. Returns how many runs were started. */
export async function scanTimed(db: PrismaClient, now = new Date(), onlyId?: string): Promise<number> {
  const flows = await db.workflow.findMany({ where: { active: true, ...(onlyId ? { id: onlyId } : {}) } });
  let n = 0;
  for (const wf of flows) {
    if (!triggerDef(wf.trigger)?.timed) continue;
    try {
      for (const [id, key, extra] of await timedCandidates(db, wf, now)) {
        if (await db.workflowRun.findUnique({ where: { workflowId_dedupeKey: { workflowId: wf.id, dedupeKey: key } }, select: { id: true } })) continue;
        if (await startRun(db, wf, id, { depth: 0, dedupeKey: key, extra })) n++;
      }
    } catch (e) {
      console.error(`Timed workflow "${wf.name}" failed`, e);
    }
  }
  return n;
}

/** Daily: timed triggers, due waits, and old history (kept for 180 days). */
export async function dailyWorkflows(db: PrismaClient, now = new Date()) {
  const started = await scanTimed(db, now);
  let finished = 0;
  for (let i = 0; i < 20; i++) {
    const n = await processDue(db, now, 50);
    finished += n;
    if (n < 50) break;
  }
  const pruned = await db.workflowRun.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * DAY) }, status: { in: ["DONE", "SKIPPED", "CANCELLED", "FAILED"] } } });
  return { started, finished, pruned: pruned.count };
}
