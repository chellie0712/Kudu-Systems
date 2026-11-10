// What the copilot can look up and do. Every tool runs as the person asking: it checks their
// permissions first and only returns what they could see on screen. Results are JSON text.
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { AppUser } from "@/auth";
import { can, canAccessJobCard, type Permission } from "@/lib/permissions";
import { nextNumberIn } from "@/lib/settings";
import { taskScope } from "@/lib/tasks";
import { customerOut, customerInclude, invoiceInclude, invoiceOut, jobInclude, jobOut, queryInclude, queryOut, quoteInclude, quoteOut } from "@/lib/integrations/serialize";

const r = (cents: number) => Math.round(cents) / 100;
const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const MAX_RESULT = 40_000;

class Denied extends Error {}
const need = (user: AppUser, p: Permission, what: string) => {
  if (!can(user, p)) throw new Denied(`${user.name} may not see ${what} in Kudu, so I can't look this up.`);
};

const limit = z.number().int().min(1).max(50).optional().describe("How many to return (default 20, at most 50)");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("A date as YYYY-MM-DD");
const range = (from?: string, to?: string) =>
  from || to ? { ...(from ? { gte: new Date(`${from}T00:00:00+02:00`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59+02:00`) } : {}) } : undefined;

type Ctx = { db: PrismaClient; user: AppUser };
type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  schema: S;
  /** Short words shown while it runs, e.g. "Looking up customers". */
  label: string;
  run: (ctx: Ctx, input: z.infer<S>) => Promise<unknown>;
};
const tool = <S extends z.ZodType>(t: ToolDef<S>) => t;

/** A job card as the person may see it: technicians-style users only their own. */
async function jobVisible(ctx: Ctx, technicianId: string | null) {
  return canAccessJobCard(ctx.user, { technicianId });
}

const TOOLS = [
  tool({
    name: "search_customers",
    label: "Looking up customers",
    description: "Find customers by name, contact person, email or phone number. Returns id, name, contact details and how many open items they have.",
    schema: z.object({ query: z.string().min(1).max(100).describe("Part of a name, email or phone number"), limit }).strict(),
    async run({ db, user }, { query, limit: n }) {
      need(user, "customers.view", "customers");
      const rows = await db.customer.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { contactPerson: { contains: query, mode: "insensitive" } },
            { email: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { contacts: { some: { OR: [{ name: { contains: query, mode: "insensitive" } }, { email: { contains: query, mode: "insensitive" } }, { phone: { contains: query } }] } } },
          ],
        },
        take: n ?? 20,
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, type: true, contactPerson: true, email: true, phone: true, siteAddress: true, archived: true },
      });
      return { customers: rows.map((c) => ({ ...c, link: `/customers/${c.id}` })) };
    },
  }),
  tool({
    name: "get_customer",
    label: "Opening the customer",
    description: "Everything about one customer: details, contacts, recent quotations, job cards and invoices, open queries and what they owe.",
    schema: z.object({ customerId: z.string().min(1).max(60) }).strict(),
    async run({ db, user }, { customerId }) {
      need(user, "customers.view", "customers");
      const c = await db.customer.findUnique({ where: { id: customerId }, include: customerInclude });
      if (!c) return { error: "No customer with that id. Search for them first." };
      const [quotes, jobs, invoices, queries] = await Promise.all([
        can(user, "quotations.view") ? db.quotation.findMany({ where: { customerId }, orderBy: { issueDate: "desc" }, take: 10, select: { id: true, number: true, status: true, title: true, total: true, issueDate: true } }) : null,
        db.jobCard.findMany({
          where: { customerId, ...(can(user, "jobcards.viewAll") ? {} : { technicianId: user.id }) },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: { id: true, number: true, status: true, jobType: true, jobDate: true, technician: true },
        }),
        can(user, "invoices.view") ? db.invoice.findMany({ where: { customerId }, orderBy: { issueDate: "desc" }, take: 10, select: { id: true, number: true, status: true, total: true, amountPaid: true, dueDate: true } }) : null,
        can(user, "queries.view") ? db.query.findMany({ where: { customerId, status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } }, take: 10, select: { id: true, number: true, subject: true, status: true, priority: true } }) : null,
      ]);
      const owing = invoices ? invoices.filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT").reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0) : null;
      return {
        customer: { ...customerOut(c), link: `/customers/${c.id}` },
        quotations: quotes?.map((q) => ({ ...q, total: r(q.total), issueDate: day(q.issueDate), link: `/quotations/${q.id}` })) ?? "not allowed to see",
        jobCards: jobs.map((j) => ({ ...j, jobDate: day(j.jobDate), link: `/job-cards/${j.id}` })),
        invoices: invoices?.map((i) => ({ ...i, total: r(i.total), amountPaid: r(i.amountPaid), dueDate: day(i.dueDate), link: `/invoices/${i.id}` })) ?? "not allowed to see",
        owingOnRecentInvoices: owing === null ? undefined : r(owing),
        openQueries: queries?.map((q) => ({ ...q, link: `/queries/${q.id}` })) ?? "not allowed to see",
      };
    },
  }),
  tool({
    name: "list_quotations",
    label: "Looking through quotations",
    description: "Quotations, newest first, with optional filters. Totals are in rands including VAT.",
    schema: z
      .object({
        status: z.enum(["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"]).optional(),
        customerId: z.string().max(60).optional(),
        issuedFrom: dateStr.optional(),
        issuedTo: dateStr.optional(),
        limit,
      })
      .strict(),
    async run({ db, user }, i) {
      need(user, "quotations.view", "quotations");
      const where: Prisma.QuotationWhereInput = { ...(i.status ? { status: i.status } : {}), ...(i.customerId ? { customerId: i.customerId } : {}), ...(range(i.issuedFrom, i.issuedTo) ? { issueDate: range(i.issuedFrom, i.issuedTo) } : {}) };
      const [rows, count, sum] = await Promise.all([
        db.quotation.findMany({ where, orderBy: { issueDate: "desc" }, take: i.limit ?? 20, include: { customer: { select: { name: true } } } }),
        db.quotation.count({ where }),
        db.quotation.aggregate({ where, _sum: { total: true } }),
      ]);
      return {
        matching: count,
        totalOfAllMatching: r(sum._sum.total ?? 0),
        quotations: rows.map((q) => ({ id: q.id, number: q.number, status: q.status, customer: q.customer.name, title: q.title, total: r(q.total), issueDate: day(q.issueDate), validUntil: day(q.validUntil), link: `/quotations/${q.id}` })),
      };
    },
  }),
  tool({
    name: "list_job_cards",
    label: "Looking through job cards",
    description: "Job cards, newest job date first, with optional filters (status stage, customer, technician, job date range).",
    schema: z
      .object({
        status: z.enum(["SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"]).optional(),
        customerId: z.string().max(60).optional(),
        technicianUserId: z.string().max(60).optional(),
        jobDateFrom: dateStr.optional(),
        jobDateTo: dateStr.optional(),
        limit,
      })
      .strict(),
    async run({ db, user }, i) {
      const own = !can(user, "jobcards.viewAll");
      const where: Prisma.JobCardWhereInput = {
        ...(i.status ? { status: i.status } : {}),
        ...(i.customerId ? { customerId: i.customerId } : {}),
        ...(own ? { technicianId: user.id } : i.technicianUserId ? { technicianId: i.technicianUserId } : {}),
        ...(range(i.jobDateFrom, i.jobDateTo) ? { jobDate: range(i.jobDateFrom, i.jobDateTo) } : {}),
      };
      const [rows, count] = await Promise.all([
        db.jobCard.findMany({ where, orderBy: [{ jobDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }], take: i.limit ?? 20, include: { customer: { select: { name: true } }, customStatus: { select: { name: true } } } }),
        db.jobCard.count({ where }),
      ]);
      return {
        onlyYourOwnJobs: own || undefined,
        matching: count,
        jobCards: rows.map((j) => ({ id: j.id, number: j.number, status: j.customStatus?.name ?? j.status, customer: j.customer.name, jobType: j.jobType, jobDate: day(j.jobDate), technician: j.technician, siteAddress: j.siteAddress, rating: j.customerRating, link: `/job-cards/${j.id}` })),
      };
    },
  }),
  tool({
    name: "list_invoices",
    label: "Looking through invoices",
    description: "Invoices, newest first, with optional filters. overdueOnly gives sent invoices past their due date with money still owing.",
    schema: z
      .object({
        status: z.enum(["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "CANCELLED"]).optional(),
        customerId: z.string().max(60).optional(),
        overdueOnly: z.boolean().optional(),
        issuedFrom: dateStr.optional(),
        issuedTo: dateStr.optional(),
        limit,
      })
      .strict(),
    async run({ db, user }, i) {
      need(user, "invoices.view", "invoices");
      const where: Prisma.InvoiceWhereInput = {
        ...(i.overdueOnly ? { status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } } : i.status ? { status: i.status } : {}),
        ...(i.customerId ? { customerId: i.customerId } : {}),
        ...(range(i.issuedFrom, i.issuedTo) ? { issueDate: range(i.issuedFrom, i.issuedTo) } : {}),
      };
      const rows = await db.invoice.findMany({ where, orderBy: { issueDate: "desc" }, take: 200, include: { customer: { select: { name: true } } } });
      const list = i.overdueOnly ? rows.filter((x) => x.total > x.amountPaid) : rows;
      return {
        matching: list.length === 200 ? "200 or more" : list.length,
        totalOwingOfThese: r(list.filter((x) => x.status !== "DRAFT" && x.status !== "CANCELLED").reduce((s, x) => s + Math.max(0, x.total - x.amountPaid), 0)),
        invoices: list.slice(0, i.limit ?? 20).map((x) => ({
          id: x.id, number: x.number, status: x.status, customer: x.customer.name, total: r(x.total), paid: r(x.amountPaid), owing: r(Math.max(0, x.total - x.amountPaid)),
          issueDate: day(x.issueDate), dueDate: day(x.dueDate), link: `/invoices/${x.id}`,
        })),
      };
    },
  }),
  tool({
    name: "get_record",
    label: "Opening the record",
    description: "One quotation, job card, invoice or customer query in full, by its id or its number (e.g. QT-0012, JC-0040, INV-0007, QRY-0003).",
    schema: z.object({ kind: z.enum(["quotation", "job_card", "invoice", "query"]), idOrNumber: z.string().min(1).max(60) }).strict(),
    async run({ db, user }, { kind, idOrNumber }) {
      const where = { OR: [{ id: idOrNumber }, { number: { equals: idOrNumber, mode: "insensitive" as const } }] };
      switch (kind) {
        case "quotation": {
          need(user, "quotations.view", "quotations");
          const q = await db.quotation.findFirst({ where, include: quoteInclude });
          return q ? { quotation: { ...quoteOut(q), notes: q.notes, terms: q.terms, link: `/quotations/${q.id}` } } : { error: "Not found" };
        }
        case "job_card": {
          const j = await db.jobCard.findFirst({ where, include: jobInclude });
          if (!j || !(await jobVisible({ db, user }, j.technicianId))) return { error: "Not found, or not one of your jobs" };
          return { jobCard: { ...jobOut(j), link: `/job-cards/${j.id}` } };
        }
        case "invoice": {
          need(user, "invoices.view", "invoices");
          const i = await db.invoice.findFirst({ where, include: invoiceInclude });
          return i ? { invoice: { ...invoiceOut(i), notes: i.notes, link: `/invoices/${i.id}` } } : { error: "Not found" };
        }
        case "query": {
          need(user, "queries.view", "customer queries");
          const q = await db.query.findFirst({ where, include: { ...queryInclude, notes: { orderBy: { createdAt: "asc" }, take: 30, select: { text: true, userName: true, createdAt: true, system: true } } } });
          return q ? { query: { ...queryOut(q), timeline: q.notes.map((n) => ({ at: day(n.createdAt), by: n.userName, text: n.text })), link: `/queries/${q.id}` } } : { error: "Not found" };
        }
      }
    },
  }),
  tool({
    name: "list_queries",
    label: "Looking through customer queries",
    description: "Customer queries and complaints, newest first. openOnly gives those not resolved or closed.",
    schema: z.object({ openOnly: z.boolean().optional(), customerId: z.string().max(60).optional(), limit }).strict(),
    async run({ db, user }, i) {
      need(user, "queries.view", "customer queries");
      const rows = await db.query.findMany({
        where: { ...(i.openOnly ? { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } } : {}), ...(i.customerId ? { customerId: i.customerId } : {}) },
        orderBy: { createdAt: "desc" },
        take: i.limit ?? 20,
        include: { customer: { select: { name: true } }, assignedTo: { select: { name: true } } },
      });
      return { queries: rows.map((q) => ({ id: q.id, number: q.number, subject: q.subject, status: q.status, priority: q.priority, category: q.category, customer: q.customer.name, assignedTo: q.assignedTo?.name ?? null, dueAt: day(q.dueAt), created: day(q.createdAt), link: `/queries/${q.id}` })) };
    },
  }),
  tool({
    name: "list_tasks",
    label: "Looking through tasks",
    description: "Tasks. mine: only tasks assigned to the person asking. openOnly: not done or cancelled. overdueOnly: open and past their due time.",
    schema: z.object({ mine: z.boolean().optional(), openOnly: z.boolean().optional(), overdueOnly: z.boolean().optional(), limit }).strict(),
    async run({ db, user }, i) {
      need(user, "tasks.view", "tasks");
      const open = i.openOnly || i.overdueOnly;
      const rows = await db.task.findMany({
        where: {
          AND: [taskScope(user), i.mine ? { assignedToId: user.id } : {}, open ? { status: { in: ["OPEN", "IN_PROGRESS"] } } : {}, i.overdueOnly ? { dueAt: { lt: new Date() } } : {}],
        },
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
        take: i.limit ?? 20,
        include: { assignedTo: { select: { name: true } }, customer: { select: { name: true } } },
      });
      return { tasks: rows.map((t) => ({ number: t.number, title: t.title, status: t.status, priority: t.priority, due: t.dueAt?.toISOString() ?? null, assignedTo: t.assignedTo?.name ?? null, customer: t.customer?.name ?? null, link: `/tasks/${t.id}` })) };
    },
  }),
  tool({
    name: "business_summary",
    label: "Adding up the figures",
    description: "Figures for a period: quotations sent and accepted, job cards done, invoiced, payments received, new customers, and money owed now (debtors). Amounts in rands incl. VAT.",
    schema: z.object({ from: dateStr, to: dateStr }).strict(),
    async run({ db, user }, { from, to }) {
      need(user, "reports.view", "reports");
      const period = range(from, to)!;
      const [quoted, accepted, jobsDone, jobsBooked, invoiced, payments, newCustomers, owing] = await Promise.all([
        db.quotation.aggregate({ where: { issueDate: period, status: { not: "DRAFT" } }, _sum: { total: true }, _count: true }),
        db.quotation.aggregate({ where: { issueDate: period, status: "ACCEPTED" }, _sum: { total: true }, _count: true }),
        db.jobCard.count({ where: { status: "COMPLETED", jobDate: period } }),
        db.jobCard.count({ where: { status: { in: ["SCHEDULED", "IN_PROGRESS"] }, jobDate: period } }),
        db.invoice.aggregate({ where: { issueDate: period, status: { notIn: ["DRAFT", "CANCELLED"] } }, _sum: { total: true }, _count: true }),
        db.payment.aggregate({ where: { date: period }, _sum: { amount: true }, _count: true }),
        db.customer.count({ where: { createdAt: period } }),
        db.invoice.findMany({ where: { status: { in: ["SENT", "PARTIALLY_PAID"] } }, select: { total: true, amountPaid: true, dueDate: true } }),
      ]);
      const now = new Date();
      const debt = owing.reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
      const overdue = owing.filter((i) => i.dueDate < now).reduce((s, i) => s + Math.max(0, i.total - i.amountPaid), 0);
      return {
        period: { from, to },
        quotationsSent: { count: quoted._count, total: r(quoted._sum.total ?? 0) },
        quotationsAccepted: { count: accepted._count, total: r(accepted._sum.total ?? 0) },
        jobCardsCompleted: jobsDone,
        jobCardsStillBookedInPeriod: jobsBooked,
        invoiced: { count: invoiced._count, total: r(invoiced._sum.total ?? 0) },
        paymentsReceived: { count: payments._count, total: r(payments._sum.amount ?? 0) },
        newCustomers,
        owedToUsNow: { total: r(debt), ofWhichOverdue: r(overdue) },
      };
    },
  }),
  tool({
    name: "list_people",
    label: "Looking up the team",
    description: "The people who use Kudu (id, name, role), e.g. to give a task to someone.",
    schema: z.object({}).strict(),
    async run({ db }) {
      const users = await db.user.findMany({ where: { disabled: false }, select: { id: true, name: true, role: true, customRole: { select: { name: true } } }, orderBy: { name: "asc" } });
      return { people: users.map((u) => ({ id: u.id, name: u.name, role: u.customRole?.name ?? u.role })) };
    },
  }),
  tool({
    name: "create_task",
    label: "Adding a task",
    description:
      "Adds a task in Kudu. Only use this when the person asks for a task or reminder. Assigned to the person asking unless assignToUserId is given. Link it to a customer, job card, quotation or invoice by id when it is about one.",
    schema: z
      .object({
        title: z.string().min(1).max(200),
        description: z.string().max(3000).optional(),
        dueInHours: z.number().int().min(0).max(24 * 90).optional().describe("Due this many hours from now (default 24)"),
        priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
        assignToUserId: z.string().max(60).optional(),
        customerId: z.string().max(60).optional(),
        jobCardId: z.string().max(60).optional(),
        quotationId: z.string().max(60).optional(),
        invoiceId: z.string().max(60).optional(),
      })
      .strict(),
    async run({ db, user }, i) {
      need(user, "tasks.edit", "or add tasks");
      const to = i.assignToUserId && i.assignToUserId !== user.id ? i.assignToUserId : user.id;
      if (to !== user.id && !can(user, "tasks.assign")) return { error: `${user.name} may not give tasks to other people. Assign it to them instead, or leave assignToUserId out.` };
      const assignee = await db.user.findFirst({ where: { id: to, disabled: false }, select: { id: true, name: true } });
      if (!assignee) return { error: "No such person. Use list_people for ids." };
      const [customer, job, quote, invoice] = await Promise.all([
        i.customerId ? db.customer.findUnique({ where: { id: i.customerId }, select: { id: true } }) : null,
        i.jobCardId ? db.jobCard.findUnique({ where: { id: i.jobCardId }, select: { id: true } }) : null,
        i.quotationId ? db.quotation.findUnique({ where: { id: i.quotationId }, select: { id: true } }) : null,
        i.invoiceId ? db.invoice.findUnique({ where: { id: i.invoiceId }, select: { id: true } }) : null,
      ]);
      const links = { customerId: customer?.id, jobCardId: job?.id, quotationId: quote?.id, invoiceId: invoice?.id };
      const t = await db.task.create({
        data: {
          number: await nextNumberIn(db, "task"),
          title: i.title,
          description: i.description ?? "",
          priority: i.priority ?? "NORMAL",
          dueAt: new Date(Date.now() + (i.dueInHours ?? 24) * 3600_000),
          assignedToId: assignee.id,
          assignedBy: user.name,
          createdById: user.id,
          createdBy: user.name,
          ...links,
          notes: { create: { text: `Added by the AI copilot when ${user.name} asked`, system: true, userName: "Kudu" } },
        },
      });
      return { created: { number: t.number, title: t.title, assignedTo: assignee.name, due: t.dueAt?.toISOString(), link: `/tasks/${t.id}` } };
    },
  }),
];

type AnyTool = (typeof TOOLS)[number];
const byName = new Map<string, AnyTool>(TOOLS.map((t) => [t.name, t]));

/** Tool definitions for the API. Inputs stream as they are written, so they are checked with zod before running. */
export const toolDefinitions: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => {
  const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
  delete schema.$schema;
  return { name: t.name, description: t.description, input_schema: schema as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true };
});

export const toolLabel = (name: string) => byName.get(name)?.label ?? "Working";

/** Runs one tool call as the person. Returns [text for Claude, is it an error]. */
export async function runTool(ctx: Ctx, name: string, input: unknown): Promise<[string, boolean]> {
  const t = byName.get(name);
  if (!t) return [`Unknown tool ${name}`, true];
  const parsed = t.schema.safeParse(input ?? {});
  if (!parsed.success) return [JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }), true];
  try {
    const out = JSON.stringify(await (t.run as (c: Ctx, i: unknown) => Promise<unknown>)(ctx, parsed.data));
    return [out.length > MAX_RESULT ? `${out.slice(0, MAX_RESULT)}… (cut short: ask for fewer results)` : out, false];
  } catch (e) {
    if (e instanceof Denied) return [e.message, true];
    console.error(`Copilot tool ${name} failed`, e);
    return ["That look-up failed on Kudu's side.", true];
  }
}
