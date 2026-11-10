import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, fmtTime, money } from "@/lib/format";
import { deleteCustomer, setCustomerArchived } from "@/app/actions/customers";
import { deleteEvent } from "@/app/actions/calendar";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { InvoiceTable, JobCardTable, QuotationTable } from "@/components/DocTables";
import { EventForm } from "@/components/EventForm";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CustomerAssetsTab } from "@/components/Assets";
import { QueryTable } from "@/components/Queries";
import { isOpen } from "@/lib/queries";
import { PortalAccessTab } from "@/components/PortalAccess";
import { CustomerContactsTab } from "@/components/Contacts";
import { contactLabel } from "@/lib/contacts";
import { currentCompany } from "@/lib/db";
import { setEmailConsent } from "@/app/actions/email";
import { CONSENT_HELP, CONSENT_LABELS } from "@/lib/email/audience";
import { TaskTable } from "@/components/Tasks";
import { isOpenTask, TASK_ORDER, TASK_ROW_INCLUDE, taskScope } from "@/lib/tasks";

const tabs = [
  { key: "info", label: "Information" },
  { key: "contacts", label: "Contacts" },
  { key: "quotations", label: "Quotations" },
  { key: "jobcards", label: "Job Cards" },
  { key: "invoices", label: "Invoices" },
  { key: "calendar", label: "Calendar" },
  { key: "assets", label: "Assets" },
  { key: "queries", label: "Queries" },
  { key: "tasks", label: "Tasks" },
  { key: "portal", label: "Portal" },
];

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; msg?: string; err?: string }>;
}) {
  const user = await requirePermission("customers.view");
  const db = await tenantDb();
  const { id } = await params;
  const { tab = "info", msg, err } = await searchParams;
  const settings = await getSettings();
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      quotations: { orderBy: { issueDate: "desc" } },
      jobCards: { orderBy: { createdAt: "desc" }, include: { customStatus: { select: { name: true, colour: true } } } },
      invoices: { orderBy: { issueDate: "desc" } },
      events: { orderBy: { start: "asc" } },
      branch: { select: { name: true } },
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { name: "asc" }, { createdAt: "asc" }],
        include: { _count: { select: { quotations: true, jobCards: true, invoices: true } } },
      },
      queries: { orderBy: { createdAt: "desc" }, include: { customer: { select: { id: true, name: true } }, assignedTo: { select: { name: true, email: true } } } },
      portalUsers: { orderBy: { createdAt: "asc" } },
      assets: {
        orderBy: [{ active: "desc" }, { code: "asc" }, { name: "asc" }],
        include: { checks: { orderBy: { checkedAt: "desc" }, include: { jobCard: { select: { id: true, number: true } } } } },
      },
    },
  });
  if (!customer) notFound();
  const tasks = can(user, "tasks.view")
    ? await db.task.findMany({ where: { AND: [{ customerId: id }, taskScope(user)] }, include: TASK_ROW_INCLUDE, orderBy: TASK_ORDER, take: 200 })
    : [];
  const sym = settings.currencySymbol;
  const live = customer.invoices.filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT");
  const invoiced = live.reduce((s, i) => s + i.total, 0);
  const outstanding = live.reduce((s, i) => s + (i.total - i.amountPaid), 0);
  const now = new Date();
  const upcoming = customer.events.filter((e) => e.end >= now);
  const past = customer.events.filter((e) => e.end < now).reverse();

  const counts: Record<string, number> = {
    contacts: customer.contacts.filter((c) => !c.archived).length,
    quotations: customer.quotations.length,
    jobcards: customer.jobCards.length,
    invoices: customer.invoices.length,
    calendar: upcoming.length,
    assets: customer.assets.filter((a) => a.active).length,
    queries: customer.queries.filter((q) => isOpen(q.status)).length,
    tasks: tasks.filter((t) => isOpenTask(t.status)).length,
    portal: customer.portalUsers.filter((u) => !u.disabled && u.passwordHash).length,
  };
  const visibleTabs = tabs.filter((t) => (t.key !== "portal" || can(user, "portal.manage")) && (t.key !== "tasks" || can(user, "tasks.view")));

  return (
    <div>
      <PageHeader
        back={{ href: "/customers", label: "Customers" }}
        title={
          <span className="flex items-center gap-3">
            {customer.name}
            {customer.archived && <span className="rounded bg-charcoal-100 px-2 py-0.5 text-xs font-medium text-charcoal-500">Archived</span>}
          </span>
        }
        subtitle={[customer.branch && `${customer.branch.name} branch`, customer.contactPerson, customer.phone, customer.email].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/quotations/new?customerId=${id}`} className="btn-primary">+ Quotation</Link>
            <Link href={`/job-cards/new?customerId=${id}`} className="btn-outline">+ Job card</Link>
            <Link href={`/invoices/new?customerId=${id}`} className="btn-outline">+ Invoice</Link>
            <Link href={`/customers/${id}/edit`} className="btn-outline">Edit</Link>
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Quotations", String(customer.quotations.length)],
          ["Open job cards", String(customer.jobCards.filter((j) => j.status === "SCHEDULED" || j.status === "IN_PROGRESS").length)],
          ["Invoiced", money(invoiced, sym)],
          ["Outstanding", money(outstanding, sym)],
        ].map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">{label}</div>
            <div className={`mt-1 text-xl font-bold ${label === "Outstanding" && outstanding > 0 ? "text-kudu-600" : ""}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-charcoal-200">
        {visibleTabs.map((t) => (
          <Link
            key={t.key}
            href={`/customers/${id}?tab=${t.key}`}
            className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key ? "border-kudu-600 text-kudu-700" : "border-transparent text-charcoal-500 hover:text-charcoal-800"
            }`}
          >
            {t.label}
            {counts[t.key] ? <span className="ml-1.5 rounded-full bg-charcoal-100 px-1.5 text-xs">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </div>

      {tab === "info" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <SectionTitle>Details</SectionTitle>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {[
                ["Type", customer.type === "BUSINESS" ? "Business" : "Individual / household"],
                ["Primary contact", customer.contactPerson],
                ["Email", customer.email],
                ["Phone", customer.phone],
                ["Mobile / alternative phone", customer.altPhone],
                ["VAT number", customer.vatNumber],
                ["Registration no.", customer.regNumber],
                ["Customer since", fmtDate(customer.createdAt)],
                ["Lead source", [customer.leadSource, customer.leadCampaign].filter(Boolean).join(" · ")],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="label">{k}</dt>
                  <dd className="text-sm">{v || <span className="text-charcoal-400">—</span>}</dd>
                </div>
              ))}
              <div>
                <dt className="label">Billing address</dt>
                <dd className="whitespace-pre-line text-sm">{customer.billingAddress || "—"}</dd>
              </div>
              <div>
                <dt className="label">Site address</dt>
                <dd className="whitespace-pre-line text-sm">{customer.siteAddress || "—"}</dd>
              </div>
            </dl>
            {customer.notes && (
              <div className="mt-6">
                <div className="label">Notes</div>
                <p className="whitespace-pre-line rounded-md bg-charcoal-50 p-3 text-sm">{customer.notes}</p>
              </div>
            )}
          </div>
          <div className="space-y-6">
            <div className="card p-6">
              <SectionTitle>Contacts</SectionTitle>
              {customer.contacts.filter((c) => !c.archived).length === 0 ? (
                <p className="text-sm text-charcoal-500">No contacts yet.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {customer.contacts.filter((c) => !c.archived).slice(0, 5).map((c) => (
                    <li key={c.id}>
                      <div className="font-medium">
                        {contactLabel(c)}
                        {c.isPrimary && <span className="ml-2 text-xs font-semibold text-kudu-600">Primary</span>}
                      </div>
                      <div className="text-charcoal-500">{[c.role, c.phone || c.mobile, c.email].filter(Boolean).join(" · ")}</div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/customers/${id}?tab=contacts`} className="mt-3 inline-block text-sm font-medium text-kudu-600">
                {can(user, "customers.edit") ? "Manage contacts →" : "All contacts →"}
              </Link>
            </div>
            <div className="card p-6">
              <SectionTitle>Next appointments</SectionTitle>
              {upcoming.length === 0 ? (
                <p className="text-sm text-charcoal-500">Nothing scheduled.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {upcoming.slice(0, 5).map((e) => (
                    <li key={e.id}>
                      <div className="font-medium">{e.title}</div>
                      <div className="text-charcoal-500">{e.allDay ? `${fmtDate(e.start)} (all day)` : fmtDateTime(e.start)}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {can(user, "campaigns.edit") && (
              <div className="card p-6">
                <SectionTitle>Email marketing</SectionTitle>
                <p className="text-sm font-medium">{CONSENT_LABELS[customer.emailConsent]}</p>
                <p className="mb-1 text-xs text-charcoal-500">{CONSENT_HELP[customer.emailConsent]}</p>
                {customer.emailConsent === "UNKNOWN" && (
                  <p className="mb-1 text-xs text-charcoal-600">
                    {live.length ? "Has an issued invoice, so they receive campaigns." : "No issued invoice yet, so campaigns are not sent to them."}
                  </p>
                )}
                {customer.emailConsentAt && <p className="text-xs text-charcoal-400">{customer.emailConsentSource} · {fmtDateTime(customer.emailConsentAt)}</p>}
                {can(user, "customers.edit") && (
                  <form action={setEmailConsent} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={id} />
                    <select name="emailConsent" className="input" defaultValue={customer.emailConsent}>
                      {Object.entries(CONSENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input name="consentNote" className="input" placeholder="How and when, e.g. ticked box on quote form 3 May" maxLength={200} />
                    <button className="btn-outline w-full">Save preference</button>
                  </form>
                )}
              </div>
            )}
            <div className="card space-y-2 p-6">
              <SectionTitle>Manage</SectionTitle>
              <form action={setCustomerArchived}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="archived" value={String(!customer.archived)} />
                <button className="btn-outline w-full">{customer.archived ? "Restore customer" : "Archive customer"}</button>
              </form>
              {can(user, "customers.delete") && (
                <form action={deleteCustomer}>
                  <input type="hidden" name="id" value={id} />
                  <ConfirmButton message={`Delete ${customer.name}? This cannot be undone.`} className="btn-danger w-full">
                    Delete customer
                  </ConfirmButton>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "contacts" && (
        <CustomerContactsTab customerId={id} contacts={customer.contacts} canEdit={can(user, "customers.edit")} />
      )}
      {tab === "quotations" && (
        <div className="card overflow-x-auto">
          <QuotationTable rows={customer.quotations} symbol={sym} />
        </div>
      )}
      {tab === "jobcards" && (
        <div className="card overflow-x-auto">
          <JobCardTable rows={customer.jobCards} />
        </div>
      )}
      {tab === "invoices" && (
        <div className="card overflow-x-auto">
          <InvoiceTable rows={customer.invoices} symbol={sym} />
        </div>
      )}
      {tab === "queries" && (
        <div className="space-y-3">
          {can(user, "queries.edit") && (
            <div className="text-right"><Link href={`/queries/new?customerId=${id}`} className="btn-primary">+ Log query</Link></div>
          )}
          <div className="card overflow-x-auto">
            {can(user, "queries.view") ? <QueryTable rows={customer.queries} showCustomer={false} /> : <Empty>You don&apos;t have access to queries.</Empty>}
          </div>
        </div>
      )}
      {tab === "tasks" && can(user, "tasks.view") && (
        <div className="space-y-3">
          {can(user, "tasks.edit") && (
            <div className="text-right">
              <Link href={`/tasks/new?customerId=${id}&returnTo=${encodeURIComponent(`/customers/${id}?tab=tasks`)}`} className="btn-primary">+ Task</Link>
            </div>
          )}
          <div className="card overflow-x-auto">
            <TaskTable rows={[...tasks.filter((t) => isOpenTask(t.status)), ...tasks.filter((t) => !isOpenTask(t.status))]} returnTo={`/customers/${id}?tab=tasks`} doneButton={can(user, "tasks.edit")} />
          </div>
        </div>
      )}
      {tab === "portal" && can(user, "portal.manage") && (
        <PortalAccessTab customer={customer} users={customer.portalUsers} companySlug={(await currentCompany()).company.slug} companyName={settings.companyName} />
      )}
      {tab === "assets" && (
        <CustomerAssetsTab customerId={id} assets={customer.assets} canEdit={can(user, "assets.edit")} canDelete={can(user, "assets.delete")} />
      )}
      {tab === "calendar" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="card p-6 lg:col-span-2">
            <SectionTitle>Upcoming</SectionTitle>
            <EventList events={upcoming} returnTo={`/customers/${id}?tab=calendar`} />
            <div className="mt-6">
              <SectionTitle>Past</SectionTitle>
              <EventList events={past.slice(0, 20)} returnTo={`/customers/${id}?tab=calendar`} />
            </div>
          </div>
          <div className="card p-6">
            <SectionTitle>New appointment</SectionTitle>
            <EventForm customerId={id} returnTo={`/customers/${id}?tab=calendar`} />
          </div>
        </div>
      )}
    </div>
  );
}

function EventList({
  events,
  returnTo,
}: {
  events: { id: string; title: string; start: Date; end: Date; allDay: boolean; location: string; jobCardId: string | null; googleEventId: string | null }[];
  returnTo: string;
}) {
  if (!events.length) return <Empty>No events.</Empty>;
  return (
    <ul className="divide-y divide-charcoal-100">
      {events.map((e) => (
        <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
          <div>
            <Link href={e.jobCardId ? `/job-cards/${e.jobCardId}` : `/calendar/${e.id}`} className="font-medium hover:text-kudu-600">
              {e.title}
            </Link>
            <div className="text-charcoal-500">
              {e.allDay ? `${fmtDate(e.start)} · all day` : `${fmtDateTime(e.start)} – ${fmtTime(e.end)}`}
              {e.location && ` · ${e.location}`}
              {e.googleEventId && " · Google"}
            </div>
          </div>
          {!e.jobCardId && (
            <form action={deleteEvent}>
              <input type="hidden" name="id" value={e.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <ConfirmButton message="Delete this event (also from Google Calendar)?" className="text-xs text-charcoal-400 hover:text-kudu-600">
                Delete
              </ConfirmButton>
            </form>
          )}
        </li>
      ))}
    </ul>
  );
}
