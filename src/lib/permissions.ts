// Roles and what each may do. This is the single place the rules live: pages, server
// actions and the menu all ask `can(role, permission)`.
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
  "calendar.viewAll": STAFF, // without it, only events of your own job cards
  "calendar.edit": STAFF,
  "settings.manage": ADMIN,
  "users.manage": ADMIN,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof RULES;

export function isRole(v: unknown): v is Role {
  return typeof v === "string" && (ROLES as readonly string[]).includes(v);
}

export function can(role: Role, permission: Permission): boolean {
  return (RULES[permission] as readonly Role[]).includes(role);
}

/** Technicians may open a job card only when it is assigned to them. */
export function canAccessJobCard(user: { id: string; role: Role }, jobCard: { technicianId: string | null }): boolean {
  return can(user.role, "jobcards.viewAll") || jobCard.technicianId === user.id;
}

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
  { label: "Invoices and payments", permission: "invoices.edit" },
  { label: "Approve invoices", permission: "invoices.approve" },
  { label: "See prices and totals", permission: "dashboard.money" },
  { label: "Calendar", permission: "calendar.edit", note: { TECHNICIAN: "View own jobs" } },
  { label: "Delete records", permission: "invoices.delete" },
  { label: "Company settings", permission: "settings.manage" },
  { label: "Manage users and roles", permission: "users.manage" },
];
