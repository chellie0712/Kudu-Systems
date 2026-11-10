// Workflows (Settings → Workflows): "when this happens, if these hold, do these things".
// This file holds the building blocks the no-code builder offers. It has no server code, so the
// builder (a client component) uses it too. The engine that runs workflows is ./engine.ts.
import { z } from "zod";

export type Subject = "customer" | "quote" | "job" | "invoice" | "query" | "submission";

export const SUBJECT_LABELS: Record<Subject, string> = {
  customer: "customer",
  quote: "quotation",
  job: "job card",
  invoice: "invoice",
  query: "query",
  submission: "form submission",
};

/** What the trigger's extra setting is: a status to match, a number of days, or a form. */
export type TriggerOption = "quoteStatus" | "jobStatus" | "invoiceStatus" | "queryStatus" | "form" | "daysAfter" | "daysBefore";

export type TriggerDef = {
  label: string;
  group: string;
  subject: Subject;
  option?: TriggerOption;
  /** Checked once a day (and when someone presses "Check now"), not when something happens. */
  timed?: boolean;
  /** Shown under the trigger in the builder. */
  help?: string;
};

export const TRIGGERS = {
  "customer.created": { label: "A new customer is added", group: "Customers", subject: "customer" },
  "customer.noJob": {
    label: "A customer has had no job for a number of days",
    group: "Customers",
    subject: "customer",
    option: "daysAfter",
    timed: true,
    help: "Counted from the customer's last completed job. Customers who never had a job are left out. Good for re-service reminders.",
  },
  "quote.created": { label: "A quotation is created", group: "Quotations", subject: "quote" },
  "quote.status": { label: "A quotation's status changes", group: "Quotations", subject: "quote", option: "quoteStatus" },
  "quote.noReply": {
    label: "A sent quotation has had no answer for a number of days",
    group: "Quotations",
    subject: "quote",
    option: "daysAfter",
    timed: true,
    help: "Counted from the quotation date, for quotations still marked Sent.",
  },
  "job.created": { label: "A job card is created", group: "Job cards", subject: "job" },
  "job.status": { label: "A job card's status changes", group: "Job cards", subject: "job", option: "jobStatus" },
  "job.signedOff": { label: "The client signs off a job", group: "Job cards", subject: "job", help: "The client's star rating and comment can be used in the conditions." },
  "job.upcoming": {
    label: "A job is coming up in a number of days",
    group: "Job cards",
    subject: "job",
    option: "daysBefore",
    timed: true,
    help: "Uses the job date. Runs again if the job is moved to another date.",
  },
  "warranty.ending": { label: "A job's warranty ends in a number of days", group: "Job cards", subject: "job", option: "daysBefore", timed: true },
  "invoice.created": { label: "An invoice is created", group: "Invoices", subject: "invoice" },
  "invoice.status": { label: "An invoice's status changes", group: "Invoices", subject: "invoice", option: "invoiceStatus" },
  "payment.received": { label: "A payment is recorded", group: "Invoices", subject: "invoice" },
  "invoice.overdue": {
    label: "An invoice is overdue by a number of days",
    group: "Invoices",
    subject: "invoice",
    option: "daysAfter",
    timed: true,
    help: "Counted from the due date, for invoices with money still owing.",
  },
  "query.created": { label: "A customer query is logged", group: "Queries", subject: "query" },
  "query.status": { label: "A query's status changes", group: "Queries", subject: "query", option: "queryStatus" },
  "form.submitted": { label: "A form is filled in", group: "Forms", subject: "submission", option: "form" },
} satisfies Record<string, TriggerDef>;

export type TriggerKey = keyof typeof TRIGGERS;
export const TRIGGER_KEYS = Object.keys(TRIGGERS) as TriggerKey[];
export const triggerDef = (k: string): TriggerDef | undefined => (TRIGGERS as Record<string, TriggerDef>)[k];

export const QUOTE_STATUSES = { DRAFT: "Draft", SENT: "Sent", ACCEPTED: "Accepted", DECLINED: "Declined", EXPIRED: "Expired" } as const;
export const INVOICE_STATUSES = { DRAFT: "Draft", SENT: "Sent", PARTIALLY_PAID: "Partly paid", PAID: "Paid", CANCELLED: "Cancelled" } as const;
export const QUERY_STATUSES = { OPEN: "Open", IN_PROGRESS: "In progress", WAITING_ON_CUSTOMER: "Waiting on customer", RESOLVED: "Resolved", CLOSED: "Closed" } as const;

// ---------- Conditions ----------

export type FieldKind = "text" | "money" | "number" | "choice";
/** Options for choice fields; "dynamic:<list>" lists come from the company's data (see BuilderLists). */
export type FieldDef = { label: string; kind: FieldKind; subjects: Subject[] | "all"; options?: Record<string, string> | `dynamic:${keyof BuilderLists}` };

export const FIELDS: Record<string, FieldDef> = {
  "customer.type": { label: "Customer type", kind: "choice", subjects: "all", options: { BUSINESS: "Business", INDIVIDUAL: "Individual" } },
  "customer.name": { label: "Customer name", kind: "text", subjects: "all" },
  "customer.leadSource": { label: "Customer lead source", kind: "text", subjects: "all" },
  "customer.branch": { label: "Customer branch", kind: "choice", subjects: "all", options: "dynamic:branches" },
  "customer.email": { label: "Customer email", kind: "text", subjects: "all" },
  "quote.total": { label: "Quotation total (incl. VAT)", kind: "money", subjects: ["quote"] },
  "quote.title": { label: "Quotation title", kind: "text", subjects: ["quote"] },
  "quote.status": { label: "Quotation status", kind: "choice", subjects: ["quote"], options: QUOTE_STATUSES },
  "job.status": { label: "Job status", kind: "choice", subjects: ["job"], options: "dynamic:jobStatuses" },
  "job.jobType": { label: "Job type", kind: "text", subjects: ["job"] },
  "job.priority": { label: "Job priority", kind: "text", subjects: ["job"] },
  "job.technician": { label: "Technician", kind: "choice", subjects: ["job"], options: "dynamic:users" },
  "job.rating": { label: "Client's star rating (1 to 5)", kind: "number", subjects: ["job"] },
  "job.feedback": { label: "Client's comment at sign-off", kind: "text", subjects: ["job"] },
  "invoice.total": { label: "Invoice total (incl. VAT)", kind: "money", subjects: ["invoice"] },
  "invoice.balance": { label: "Amount still owing", kind: "money", subjects: ["invoice"] },
  "invoice.status": { label: "Invoice status", kind: "choice", subjects: ["invoice"], options: INVOICE_STATUSES },
  "query.category": { label: "Query category", kind: "text", subjects: ["query"] },
  "query.source": { label: "Query source", kind: "text", subjects: ["query"] },
  "query.priority": { label: "Query priority", kind: "choice", subjects: ["query"], options: { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" } },
  "query.status": { label: "Query status", kind: "choice", subjects: ["query"], options: QUERY_STATUSES },
  "submission.form": { label: "Form", kind: "choice", subjects: ["submission"], options: "dynamic:forms" },
  "submission.source": { label: "Filled in", kind: "choice", subjects: ["submission"], options: { web: "On the website", staff: "By staff in Kudu" } },
};

export const fieldsFor = (s: Subject) => Object.entries(FIELDS).filter(([, f]) => f.subjects === "all" || f.subjects.includes(s));

export const OPS = {
  eq: "is",
  ne: "is not",
  gt: "is more than",
  lt: "is less than",
  contains: "contains",
  empty: "is empty",
  notEmpty: "is not empty",
} as const;
export type Op = keyof typeof OPS;
export const opsFor = (kind: FieldKind): Op[] =>
  kind === "money" || kind === "number" ? ["eq", "ne", "gt", "lt", "empty", "notEmpty"] : kind === "choice" ? ["eq", "ne", "empty", "notEmpty"] : ["eq", "ne", "contains", "empty", "notEmpty"];

// ---------- Actions ----------

export type ActionDef = { label: string; subjects: Subject[] | "all"; help?: string };

export const ACTIONS = {
  task: { label: "Create a task", subjects: "all" },
  email: {
    label: "Send an email",
    subjects: "all",
    help: "Sent from the chosen person's own mailbox (connected under Email campaigns → My mailbox).",
  },
  query: { label: "Log a customer query", subjects: "all" },
  jobStatus: { label: "Change the job's status", subjects: ["job"] },
  quoteStatus: { label: "Change the quotation's status", subjects: ["quote"] },
  jobFromQuote: { label: "Create a job card from the quotation", subjects: ["quote"], help: "Once per quotation. The job card is left without a date or technician for the office to book." },
  invoiceFromJob: { label: "Create a draft invoice from the job card", subjects: ["job"], help: "Once per job card. Copies the quotation lines and unbilled labour; somebody checks it before sending." },
} satisfies Record<string, ActionDef>;

export type ActionType = keyof typeof ACTIONS;
export const actionsFor = (s: Subject) => (Object.entries(ACTIONS) as [ActionType, ActionDef][]).filter(([, a]) => a.subjects === "all" || a.subjects.includes(s));

/** Who a created task goes to. */
export const ASSIGN_TO = {
  rules: "Use the task assignment rules",
  technician: "The job's technician",
  owner: "Whoever the query is assigned to",
  nobody: "Nobody (anyone can take it)",
} as const;

/** Where an email goes. */
export const EMAIL_TO = {
  customer: "The customer (their main email)",
  technician: "The job's technician",
  user: "A person in Kudu",
} as const;

/** Words in {braces} that are replaced in titles and messages. */
export const PLACEHOLDERS: Record<string, string> = {
  customer: "Customer name",
  contact: "Contact person",
  number: "Document number (QT-0001, JC-0001…)",
  title: "Quotation title or query subject",
  total: "Total in rands",
  balance: "Amount still owing",
  status: "Status",
  technician: "Technician",
  date: "Job date, due date or quotation date",
  rating: "Star rating",
  feedback: "Client's comment",
  form: "Form name",
  days: "The number of days in the trigger",
  link: "Link to open it in Kudu",
  company: "Your company name",
};

// ---------- Stored shape ----------

const conditionSchema = z.object({
  field: z.string().refine((f) => f in FIELDS, "Unknown field"),
  op: z.enum(Object.keys(OPS) as [Op, ...Op[]]),
  value: z.string().trim().max(200).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

const actionSchema = z.object({
  type: z.enum(Object.keys(ACTIONS) as [ActionType, ...ActionType[]]),
  title: z.string().trim().max(200).default(""), // task title, email subject, query subject
  body: z.string().trim().max(5000).default(""), // task description, email text, query description
  category: z.string().trim().max(60).default(""),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  dueHours: z.coerce.number().int().min(0).max(24 * 365).default(24),
  assign: z.string().max(60).default("rules"), // ASSIGN_TO key, or "user:<id>"
  from: z.string().max(60).default(""), // email: user id whose mailbox sends it
  to: z.string().max(60).default("customer"), // EMAIL_TO key, or "user:<id>"
  status: z.string().max(60).default(""), // jobStatus / quoteStatus
});
export type WorkflowAction = z.infer<typeof actionSchema>;

export const blankAction = (type: ActionType): WorkflowAction => actionSchema.parse({ type });

export const triggerConfigSchema = z.object({
  status: z.string().max(60).default(""), // "" = any change
  formId: z.string().max(60).default(""), // "" = any form
  days: z.coerce.number().int().min(0).max(3650).default(3),
});
export type TriggerConfig = z.infer<typeof triggerConfigSchema>;

export const parseConditions = (v: unknown): Condition[] => z.array(conditionSchema).max(20).catch([]).parse(v);
export const parseActions = (v: unknown): WorkflowAction[] => z.array(actionSchema).max(10).catch([]).parse(v);
export const parseTriggerConfig = (v: unknown): TriggerConfig => triggerConfigSchema.catch(triggerConfigSchema.parse({})).parse(v ?? {});

/** Names and ids the builder needs for its drop-downs. */
export type BuilderLists = {
  users: Record<string, string>;
  mailboxes: Record<string, string>; // user id → "Name (email)" for users with a connected mailbox
  branches: Record<string, string>;
  jobStatuses: Record<string, string>; // "SCHEDULED" etc. and "custom:<id>"
  forms: Record<string, string>;
};

/** Plain-language summary for lists, e.g. "When a quotation's status changes to Accepted". */
export function describeTrigger(trigger: string, cfg: TriggerConfig, lists?: Partial<BuilderLists>): string {
  const t = triggerDef(trigger);
  if (!t) return trigger;
  const statusName = (k: string) =>
    ({ ...QUOTE_STATUSES, ...INVOICE_STATUSES, ...QUERY_STATUSES, ...(lists?.jobStatuses ?? {}) } as Record<string, string>)[k] ?? k;
  switch (t.option) {
    case "quoteStatus":
    case "jobStatus":
    case "invoiceStatus":
    case "queryStatus":
      return cfg.status ? `${t.label.replace(/ changes$/, "")} changes to ${statusName(cfg.status)}` : t.label;
    case "form":
      return cfg.formId ? `The form “${lists?.forms?.[cfg.formId] ?? "?"}” is filled in` : "Any form is filled in";
    case "daysAfter":
    case "daysBefore":
      return t.label.replace("a number of days", `${cfg.days} day${cfg.days === 1 ? "" : "s"}`);
    default:
      return t.label;
  }
}

export function fmtWait(minutes: number): string {
  if (!minutes) return "";
  if (minutes % 1440 === 0) return `${minutes / 1440} day${minutes === 1440 ? "" : "s"}`;
  if (minutes % 60 === 0) return `${minutes / 60} hour${minutes === 60 ? "" : "s"}`;
  return `${minutes} minutes`;
}

// ---------- Ready-made recipes ----------

export type Recipe = {
  key: string;
  name: string;
  description: string;
  trigger: TriggerKey;
  config?: Partial<TriggerConfig>;
  conditions?: Condition[];
  waitMinutes?: number;
  oncePer?: boolean;
  actions: Partial<WorkflowAction>[];
};

export const RECIPES: Recipe[] = [
  {
    key: "quote-follow-up",
    name: "Follow up quotations with no answer",
    description: "Three days after a quotation was sent with no answer, someone gets a task to phone the customer.",
    trigger: "quote.noReply",
    config: { days: 3 },
    actions: [{ type: "task", title: "Follow up quotation {number} with {customer}", body: "Quotation {number} for {total} was sent on {date} and the customer has not answered yet.\n{link}", category: "Follow-up call", dueHours: 24 }],
  },
  {
    key: "accepted-to-job",
    name: "Accepted quotation → job card",
    description: "When a quotation is accepted, a job card is made from it and the office gets a task to book it.",
    trigger: "quote.status",
    config: { status: "ACCEPTED" },
    oncePer: true,
    actions: [
      { type: "jobFromQuote" },
      { type: "task", title: "Book the job for {customer} ({number} accepted)", category: "Book job", dueHours: 24, priority: "HIGH" },
    ],
  },
  {
    key: "completed-to-invoice",
    name: "Completed job → draft invoice",
    description: "When a job is completed, a draft invoice is made from it and someone gets a task to check and send it.",
    trigger: "job.status",
    config: { status: "COMPLETED" },
    oncePer: true,
    actions: [
      { type: "invoiceFromJob" },
      { type: "task", title: "Check and send the invoice for {number} ({customer})", category: "Admin", dueHours: 24 },
    ],
  },
  {
    key: "low-rating",
    name: "Unhappy client at sign-off → complaint",
    description: "When a client gives 3 stars or fewer at sign-off, a complaint query is logged and a manager is asked to call them.",
    trigger: "job.signedOff",
    conditions: [{ field: "job.rating", op: "lt", value: "4" }],
    oncePer: true,
    actions: [
      { type: "query", title: "{rating}-star rating on {number}", body: "The client gave {rating} stars when signing off {number}.\nTheir comment: {feedback}", category: "Complaint", priority: "HIGH" },
      { type: "task", title: "Call {customer} about their {rating}-star rating", category: "Follow-up call", dueHours: 4, priority: "HIGH" },
    ],
  },
  {
    key: "overdue-invoice",
    name: "Chase overdue invoices",
    description: "Seven days after an invoice's due date, if money is still owing, someone gets a task to chase payment.",
    trigger: "invoice.overdue",
    config: { days: 7 },
    actions: [{ type: "task", title: "Chase payment of {number} ({balance} owing) from {customer}", category: "Chase payment", dueHours: 24 }],
  },
  {
    key: "job-reminder",
    name: "Remind the customer before a job",
    description: "One day before a job, the customer gets an email reminder from the office mailbox. Choose whose mailbox sends it before switching on.",
    trigger: "job.upcoming",
    config: { days: 1 },
    actions: [
      {
        type: "email",
        to: "customer",
        title: "Reminder: {company} is coming on {date}",
        body: "Hello {contact},\n\nThis is a reminder that {technician} from {company} is booked to visit you on {date} (job {number}).\n\nIf this no longer suits you, please reply to this email or give us a call.\n\nKind regards\n{company}",
      },
    ],
  },
  {
    key: "re-service",
    name: "Re-service reminder after 6 months",
    description: "When a customer has had no job for 180 days, someone gets a task to offer them a re-service.",
    trigger: "customer.noJob",
    config: { days: 180 },
    actions: [{ type: "task", title: "Offer {customer} a re-service", body: "Their last job was {days} days ago.\n{link}", category: "Follow-up call", dueHours: 72, priority: "LOW" }],
  },
  {
    key: "warranty-ending",
    name: "Warranty ending soon",
    description: "Fourteen days before a job's warranty ends, someone gets a task to book a follow-up treatment.",
    trigger: "warranty.ending",
    config: { days: 14 },
    actions: [{ type: "task", title: "Warranty on {number} ends {date}: offer {customer} a follow-up", category: "Follow-up call", dueHours: 72 }],
  },
  {
    key: "big-quote",
    name: "Large quotation → manager review",
    description: "When a quotation over R50 000 is created, a manager gets a task to review it.",
    trigger: "quote.created",
    conditions: [{ field: "quote.total", op: "gt", value: "50000" }],
    actions: [{ type: "task", title: "Review large quotation {number} ({total}) for {customer}", category: "Admin", dueHours: 8, priority: "HIGH" }],
  },
  {
    key: "welcome-call",
    name: "Welcome call for new customers",
    description: "When a new customer is added, someone gets a task to phone and welcome them.",
    trigger: "customer.created",
    actions: [{ type: "task", title: "Welcome call to {customer}", category: "Follow-up call", dueHours: 48, priority: "LOW" }],
  },
];
