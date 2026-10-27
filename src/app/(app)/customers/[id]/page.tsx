import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, fmtTime, money } from "@/lib/format";
import { deleteCustomer, setCustomerArchived } from "@/app/actions/customers";
import { deleteEvent } from "@/app/actions/calendar";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { InvoiceTable, JobCardTable, QuotationTable } from "@/components/DocTables";
import { EventForm } from "@/components/EventForm";
import { ConfirmButton } from "@/components/ConfirmButton";

const tabs = [
  { key: "info", label: "Information" },
  { key: "quotations", label: "Quotations" },
  { key: "jobcards", label: "Job Cards" },
  { key: "invoices", label: "Invoices" },
  { key: "calendar", label: "Calendar" },
];

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; msg?: string; err?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { tab = "info", msg, err } = await searchParams;
  const settings = await getSettings();
  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      quotations: { orderBy: { issueDate: "desc" } },
      jobCards: { orderBy: { createdAt: "desc" } },
      invoices: { orderBy: { issueDate: "desc" } },
      events: { orderBy: { start: "asc" } },
    },
  });
  if (!customer) notFound();
  const sym = settings.currencySymbol;
  const live = customer.invoices.filter((i) => i.status !== "CANCELLED" && i.status !== "DRAFT");
  const invoiced = live.reduce((s, i) => s + i.total, 0);
  const outstanding = live.reduce((s, i) => s + (i.total - i.amountPaid), 0);
  const now = new Date();
  const upcoming = customer.events.filter((e) => e.end >= now);
  const past = customer.events.filter((e) => e.end < now).reverse();

  const counts: Record<string, number> = {
    quotations: customer.quotations.length,
    jobcards: customer.jobCards.length,
    invoices: customer.invoices.length,
    calendar: upcoming.length,
  };

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
        subtitle={[customer.contactPerson, customer.phone, customer.email].filter(Boolean).join(" · ")}
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
        {tabs.map((t) => (
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
                ["Contact person", customer.contactPerson],
                ["Email", customer.email],
                ["Phone", customer.phone],
                ["Alternative phone", customer.altPhone],
                ["VAT number", customer.vatNumber],
                ["Registration no.", customer.regNumber],
                ["Customer since", fmtDate(customer.createdAt)],
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
            <div className="card space-y-2 p-6">
              <SectionTitle>Manage</SectionTitle>
              <form action={setCustomerArchived}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="archived" value={String(!customer.archived)} />
                <button className="btn-outline w-full">{customer.archived ? "Restore customer" : "Archive customer"}</button>
              </form>
              <form action={deleteCustomer}>
                <input type="hidden" name="id" value={id} />
                <ConfirmButton message={`Delete ${customer.name}? This cannot be undone.`} className="btn-danger w-full">
                  Delete customer
                </ConfirmButton>
              </form>
            </div>
          </div>
        </div>
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
