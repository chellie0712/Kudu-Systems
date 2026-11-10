// Roles and what each may do. This is the single place the rules live: pages, server
// actions and the menu all ask `can(user, permission)`. Admins can also set up custom roles
// (Settings → Roles) with their own set of permissions; see `can` below.
//
//   ADMIN       everything, including company settings, users and deleting records
//   OFFICE      customers, quotations, job cards, invoices, payments, calendar
//   TECHNICIAN  only the job cards assigned to them (fill in, photos, client sign-off),
//               and their own jobs on the calendar; never sees prices or invoices

export const ROLES = ["ADMIN", "OFFICE", "TECHNICIAN"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  OFFICE: "Office",
  TECHNICIAN: "Technician",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Everything, including company settings, users and deleting records.",
  OFFICE: "Customers, quotations, job cards, invoices, payments and the calendar. No settings, users or deleting.",
  TECHNICIAN: "Only the job cards assigned to them, and those jobs on the calendar. No prices, quotations or invoices.",
};

const ALL: readonly Role[] = ROLES;
const STAFF: readonly Role[] = ["ADMIN", "OFFICE"];
const ADMIN: readonly Role[] = ["ADMIN"];

const RULES = {
  "dashboard.money": STAFF, // money figures on the dashboard
  "customers.view": STAFF,
  "customers.edit": STAFF,
  "customers.delete": ADMIN,
  "quotations.view": STAFF,
  "quotations.edit": STAFF,
  "quotations.delete": ADMIN,
  "quotations.approve": ADMIN, // approve quotations when Settings → Approvals → Quotations is on
  "jobcards.viewAll": STAFF, // without it, only job cards assigned to you
  "jobcards.create": STAFF,
  "jobcards.edit": ALL, // technicians: only their own (checked with canAccessJobCard)
  "jobcards.assign": STAFF, // change customer, technician, schedule
  "jobcards.delete": ADMIN,
  "invoices.view": STAFF,
  "invoices.edit": STAFF,
  "invoices.delete": ADMIN,
  "invoices.approve": ADMIN, // approve invoices when Settings → Invoice approval is on
  "payments.record": STAFF,
  "payments.delete": ADMIN,
  "time.track": ALL, // own time on job cards you can open
  "time.manageAll": STAFF, // add, edit or delete anyone's time; see labour rates and value
  "labour.bill": STAFF, // put unbilled time on an invoice
  "inventory.view": STAFF, // stock items, all locations, movement history, cost prices
  "inventory.manage": STAFF, // add items, receive, transfer, adjust
  "inventory.delete": ADMIN,
  "stock.use": ALL, // record stock used on a job card you can open (technicians: from their own van)
  "materials.bill": STAFF, // put used stock on an invoice
  "assets.edit": STAFF, // add and edit customer assets (technicians may add one from their own job card)
  "assets.check": ALL, // record asset checks on a job card you can open
  "assets.delete": ADMIN,
  "queries.view": STAFF, // customer queries, complaints and requests
  "queries.edit": STAFF, // log, update, assign, resolve
  "queries.delete": ADMIN,
  "tasks.view": ALL, // tasks assigned to or created by you
  "tasks.viewAll": STAFF, // everyone's tasks, the team views, escalations
  "tasks.edit": ALL, // create tasks, update and complete the ones you can see
  "tasks.assign": STAFF, // give tasks to other people
  "tasks.delete": ADMIN,
  "forms.fill": ALL, // fill in the company's internal forms
  "forms.view": STAFF, // see everyone's form submissions, including web forms
  "forms.manage": ADMIN, // build forms and publish web forms
  "forms.delete": ADMIN, // delete forms and submissions
  "workflows.manage": ADMIN, // build automatic workflows and see what they did
  "reports.view": STAFF, // sales, cashflow, debtors and productivity reports, CSV exports
  "profit.view": ADMIN, // profit & loss (includes wages and other expenses)
  "expenses.manage": ADMIN, // record business expenses for the profit & loss
  "expenses.claim": ALL, // claim back their own out-of-pocket expenses
  "expenses.approve": ADMIN, // approve or reject expense claims, mark them paid back
  "purchases.view": STAFF, // purchase orders
  "purchases.edit": STAFF, // create purchase orders, send for approval, mark ordered, receive stock
  "purchases.approve": ADMIN,
  "purchases.delete": ADMIN,
  "leave.request": ALL, // request leave for themselves
  "leave.viewAll": STAFF, // see everyone's leave (who is off when)
  "leave.approve": ADMIN, // approve or decline leave requests
  "email.connect": STAFF, // connect your own mailbox, so campaigns you send go out from your sign-in address
  "campaigns.edit": STAFF, // write email campaigns and send tests
  "campaigns.send": STAFF, // send a campaign to customers, pause or cancel it
  "campaigns.delete": ADMIN,
  "portal.manage": STAFF, // give customers access to the customer portal, send new links, switch access off
  "calendar.viewAll": STAFF, // without it, only events of your own job cards
  "calendar.edit": STAFF,
  "settings.manage": ADMIN,
  "users.manage": ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof RULES;

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

/**
 * Who is asking: a built-in role, or a user. A user with a custom role (Settings → Roles) has
 * exactly that role's `permissions`; otherwise their built-in role's.
 */
export type Access = Role | { role: Role; permissions?: readonly string[] | null };

export function can(who: Access, permission: Permission): boolean {
  if (typeof who === "string") return (RULES[permission] as readonly Role[]).includes(who);
  if (who.permissions) return who.permissions.includes(permission);
  return (RULES[permission] as readonly Role[]).includes(who.role);
}

/** Without "See all job cards", a user may open a job card only when it is assigned to them. */
export function canAccessJobCard(user: { id: string; role: Role; permissions?: readonly string[] | null }, jobCard: { technicianId: string | null }): boolean {
  return can(user, "jobcards.viewAll") || jobCard.technicianId === user.id;
}

export const PERMISSIONS = Object.keys(RULES) as Permission[];

export function isPermission(v: unknown): v is Permission {
  return typeof v === "string" && v in RULES;
}

/** The permissions a built-in role has, e.g. to start a custom role from. */
export function permissionsOf(role: Role): Permission[] {
  return PERMISSIONS.filter((p) => can(role, p));
}

/** A custom role's value in a role select: "custom:<id>". */
export const CUSTOM_ROLE_PREFIX = "custom:";

/** Custom roles can be based on these; Admin always has everything and stays built-in only. */
export const CUSTOM_BASE_ROLES = ["OFFICE", "TECHNICIAN"] as const satisfies readonly Role[];

/** Every permission, grouped and explained, for the custom role editor in Settings → Roles. */
export const PERMISSION_INFO: Record<Permission, { group: string; label: string; help?: string }> = {
  "dashboard.money": { group: "General", label: "See prices, totals and money figures", help: "Without it, prices are hidden on job cards and the dashboard." },
  "customers.view": { group: "Customers", label: "See customers" },
  "customers.edit": { group: "Customers", label: "Add and edit customers and their contacts" },
  "customers.delete": { group: "Customers", label: "Delete customers" },
  "portal.manage": { group: "Customers", label: "Give customers access to the customer portal" },
  "assets.edit": { group: "Customers", label: "Add and edit customer assets" },
  "assets.check": { group: "Customers", label: "Record asset checks on job cards they can open" },
  "assets.delete": { group: "Customers", label: "Delete customer assets" },
  "queries.view": { group: "Customers", label: "See customer queries and complaints" },
  "queries.edit": { group: "Customers", label: "Log, assign and resolve queries" },
  "queries.delete": { group: "Customers", label: "Delete queries" },
  "tasks.view": { group: "Tasks", label: "See their own tasks", help: "Tasks assigned to them or that they created." },
  "tasks.viewAll": { group: "Tasks", label: "See everyone's tasks and escalations" },
  "tasks.edit": { group: "Tasks", label: "Create tasks and update the ones they can see" },
  "tasks.assign": { group: "Tasks", label: "Give tasks to other people" },
  "tasks.delete": { group: "Tasks", label: "Delete tasks" },
  "forms.fill": { group: "Forms", label: "Fill in forms" },
  "forms.view": { group: "Forms", label: "See all form submissions, including web forms" },
  "forms.manage": { group: "Forms", label: "Build forms and publish web forms" },
  "forms.delete": { group: "Forms", label: "Delete forms and submissions" },
  "workflows.manage": { group: "Administration", label: "Build workflows (automations)", help: "Workflows act for the whole company: they create tasks, change statuses and can send emails." },
  "quotations.view": { group: "Quotations", label: "See quotations" },
  "quotations.edit": { group: "Quotations", label: "Create and edit quotations" },
  "quotations.delete": { group: "Quotations", label: "Delete quotations" },
  "quotations.approve": { group: "Quotations", label: "Approve quotations", help: "When Settings → Approvals → Quotations is on." },
  "jobcards.viewAll": { group: "Job cards", label: "See all job cards", help: "Without it, only job cards assigned to them." },
  "jobcards.create": { group: "Job cards", label: "Create job cards" },
  "jobcards.edit": { group: "Job cards", label: "Fill in and sign off job cards they can open" },
  "jobcards.assign": { group: "Job cards", label: "Assign job cards: customer, technician, schedule, scope" },
  "jobcards.delete": { group: "Job cards", label: "Delete job cards" },
  "time.track": { group: "Job cards", label: "Record their own time on jobs" },
  "time.manageAll": { group: "Job cards", label: "Manage everyone's time and see labour rates" },
  "calendar.viewAll": { group: "Calendar", label: "See the whole calendar", help: "Without it, only events of their own job cards." },
  "calendar.edit": { group: "Calendar", label: "Add and edit appointments" },
  "invoices.view": { group: "Invoices", label: "See invoices" },
  "invoices.edit": { group: "Invoices", label: "Create and edit invoices" },
  "invoices.approve": { group: "Invoices", label: "Approve invoices", help: "When Settings → Invoice approval is on." },
  "invoices.delete": { group: "Invoices", label: "Delete invoices" },
  "payments.record": { group: "Invoices", label: "Record payments" },
  "payments.delete": { group: "Invoices", label: "Delete payments" },
  "labour.bill": { group: "Invoices", label: "Put unbilled labour on an invoice" },
  "materials.bill": { group: "Invoices", label: "Put used stock on an invoice" },
  "inventory.view": { group: "Inventory", label: "See stock items, all locations and cost prices" },
  "inventory.manage": { group: "Inventory", label: "Add items, receive, transfer and count stock" },
  "inventory.delete": { group: "Inventory", label: "Delete stock items" },
  "stock.use": { group: "Inventory", label: "Record stock used on job cards they can open" },
  "reports.view": { group: "Reports and money", label: "Reports, cashflow and marketing figures" },
  "profit.view": { group: "Reports and money", label: "Profit and loss (includes wages and expenses)" },
  "expenses.manage": { group: "Reports and money", label: "Record business expenses" },
  "expenses.claim": { group: "Expense claims and leave", label: "Claim back their own expenses" },
  "expenses.approve": { group: "Expense claims and leave", label: "Approve expense claims and mark them paid" },
  "leave.request": { group: "Expense claims and leave", label: "Request leave" },
  "leave.viewAll": { group: "Expense claims and leave", label: "See everyone's leave" },
  "leave.approve": { group: "Expense claims and leave", label: "Approve leave requests" },
  "purchases.view": { group: "Purchase orders", label: "See purchase orders" },
  "purchases.edit": { group: "Purchase orders", label: "Create purchase orders, mark ordered, receive stock" },
  "purchases.approve": { group: "Purchase orders", label: "Approve purchase orders" },
  "purchases.delete": { group: "Purchase orders", label: "Delete purchase orders" },
  "email.connect": { group: "Email marketing", label: "Connect their own mailbox" },
  "campaigns.edit": { group: "Email marketing", label: "Write email campaigns and send tests" },
  "campaigns.send": { group: "Email marketing", label: "Send campaigns to customers" },
  "campaigns.delete": { group: "Email marketing", label: "Delete campaigns" },
  "settings.manage": { group: "Administration", label: "Company settings" },
  "users.manage": { group: "Administration", label: "Manage users and roles" },
};

/** The permission table, for the Settings → Users screen. */
export const PERMISSION_TABLE: { label: string; permission: Permission; note?: Partial<Record<Role, string>> }[] = [
  { label: "See customers", permission: "customers.view" },
  { label: "Add and edit customers", permission: "customers.edit" },
  { label: "Quotations", permission: "quotations.edit" },
  { label: "See all job cards", permission: "jobcards.viewAll", note: { TECHNICIAN: "Own only" } },
  { label: "Create job cards", permission: "jobcards.create" },
  { label: "Fill in and sign off job cards", permission: "jobcards.edit", note: { TECHNICIAN: "Own only" } },
  { label: "Record own time on jobs", permission: "time.track", note: { TECHNICIAN: "Own jobs" } },
  { label: "Manage everyone's time, bill labour", permission: "time.manageAll" },
  { label: "Inventory: items, receiving, transfers, counts", permission: "inventory.manage", note: { TECHNICIAN: "Own van, view" } },
  { label: "Record stock used on jobs", permission: "stock.use", note: { TECHNICIAN: "Own jobs, own van" } },
  { label: "Customer assets", permission: "assets.edit", note: { TECHNICIAN: "Check and add on own jobs" } },
  { label: "Customer queries and complaints", permission: "queries.edit" },
  { label: "Tasks: everyone's, and assign to others", permission: "tasks.assign", note: { TECHNICIAN: "Own tasks" } },
  { label: "Forms: fill in", permission: "forms.fill" },
  { label: "Forms: see all submissions and web forms", permission: "forms.view", note: { TECHNICIAN: "Own only" } },
  { label: "Forms: build and publish", permission: "forms.manage" },
  { label: "Workflows (automations)", permission: "workflows.manage" },
  { label: "Reports and cashflow", permission: "reports.view" },
  { label: "Email campaigns to customers (from own mailbox)", permission: "campaigns.send" },
  { label: "Invoices and payments", permission: "invoices.edit" },
  { label: "Approve invoices, quotations and purchase orders", permission: "invoices.approve" },
  { label: "Purchase orders", permission: "purchases.edit" },
  { label: "Claim expenses and request leave", permission: "leave.request" },
  { label: "Approve expense claims and leave", permission: "leave.approve" },
  { label: "See prices and totals", permission: "dashboard.money" },
  { label: "Calendar", permission: "calendar.edit", note: { TECHNICIAN: "View own jobs" } },
  { label: "Delete records", permission: "invoices.delete" },
  { label: "Company settings", permission: "settings.manage" },
  { label: "Manage users and roles", permission: "users.manage" },
];
