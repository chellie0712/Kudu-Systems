import Link from "next/link";
import { AskCopilot } from "@/components/Copilot";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, canAccessJobCard } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { dayKey, fmtDateTime } from "@/lib/format";
import { LEAVE_TYPE_LABELS } from "@/lib/leave";
import { fmtDuration } from "@/lib/monitor";
import { createInvoiceFromJobCard, deleteJobCard, setJobCardStatus } from "@/app/actions/jobCards";
import { Flash, PageHeader } from "@/components/ui";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { TimeSection } from "@/components/TimeSection";
import { StockSection } from "@/components/StockSection";
import { CUSTOM_PREFIX } from "@/lib/jobStatus";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";
import { isOpen } from "@/lib/queries";
import { JobCardSheet } from "@/components/JobCardSheet";
import { JobAssetsSection } from "@/components/Assets";

import { LinkedTasks } from "@/components/Tasks";
import { LinkedForms } from "@/components/Forms";
import { LinkedDocuments } from "@/components/LinkedDocuments";

export default async function JobCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const user = await requireUser();
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [j, settings] = await Promise.all([
    db.jobCard.findUnique({
      where: { id },
      include: {
        customer: { include: { branch: true } },
        quotation: { select: { id: true, number: true } },
        photos: { select: { id: true, kind: true }, orderBy: { sortOrder: "asc" } },
        customStatus: { select: { name: true, colour: true } },
        checklists: { orderBy: { sortOrder: "asc" } },
        invoices: { select: { id: true, number: true, status: true } },
        timeEntries: { orderBy: { start: "asc" }, include: { invoice: { select: { id: true, number: true } } } },
        events: { select: { googleEventId: true } },
        queries: { select: { id: true, number: true, status: true }, orderBy: { createdAt: "asc" } },
        statusChanges: { orderBy: { changedAt: "asc" } },
        assetChecks: { include: { asset: true }, orderBy: [{ asset: { code: "asc" } }, { asset: { name: "asc" } }] },
        stockMovements: {
          where: { kind: "USE" },
          orderBy: { createdAt: "asc" },
          include: {
            item: { select: { id: true, name: true, unit: true, sellPrice: true } },
            fromLocation: { select: { name: true } },
            invoice: { select: { id: true, number: true } },
          },
        },
      },
    }),
    getSettings(),
  ]);
  if (!j) notFound();
  if (!canAccessJobCard(user, j)) redirect("/no-access?need=jobcards.viewAll");
  const may = (p: Parameters<typeof can>[1]) => can(user, p);
  const onGoogle = j.events.some((e) => e.googleEventId);
  // Warn when the technician has approved leave on the scheduled day.
  const jobDay = j.scheduledStart && j.technicianId && !["COMPLETED", "CANCELLED"].includes(j.status) ? new Date(`${dayKey(j.scheduledStart)}T00:00:00Z`) : null;
  const techLeave = jobDay
    ? await db.leaveRequest.findFirst({ where: { userId: j.technicianId!, status: "APPROVED", startDate: { lte: jobDay }, endDate: { gte: jobDay } }, include: { user: { select: { name: true, email: true } } } })
    : null;
  const customStatuses = await db.jobStatus.findMany({
    where: { active: true, id: { not: j.statusId ?? "" }, ...(may("jobcards.assign") ? {} : { stage: { not: "CANCELLED" } }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const people = may("time.manageAll")
    ? (await db.user.findMany({ where: { disabled: false }, select: { id: true, name: true, email: true, labourRate: true }, orderBy: { name: "asc" } })).map((u) => ({
        id: u.id,
        name: u.name || u.email || "",
        labourRate: u.labourRate,
      }))
    : [];
  // Stock can be booked out of any location by the office, and only out of their own van by a technician.
  const [stockLocations, stockItems, customerAssets] = await Promise.all([
    db.stockLocation.findMany({
      where: { active: true, ...(may("inventory.manage") ? {} : { type: "VAN", userId: user.id }) },
      select: { id: true, name: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    db.stockItem.findMany({ where: { active: true }, select: { id: true, name: true, unit: true, levels: { select: { locationId: true, quantity: true } } }, orderBy: { name: "asc" } }),
    db.customerAsset.findMany({ where: { customerId: j.customerId }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <div>
      <PageHeader
        back={may("customers.view") ? { href: `/customers/${j.customerId}?tab=jobcards`, label: j.customer.name } : { href: "/job-cards", label: "My Job Cards" }}
        title={<span className="flex items-center gap-3">{j.number} <JobStatusBadge status={j.status} custom={j.customStatus} /></span>}
        subtitle={[j.jobType, j.scheduledStart && fmtDateTime(j.scheduledStart), onGoogle && "On Google Calendar"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/job-cards/${j.id}/edit`} className="btn-primary">Edit / complete</Link>
            {may("ai.use") && <AskCopilot ask={`Summarise job card ${j.number} and draft a short message to the customer about it.`} />}
            {may("invoices.edit") && (
              <form action={createInvoiceFromJobCard}>
                <input type="hidden" name="id" value={j.id} />
                <button className="btn-dark">Create invoice</button>
              </form>
            )}
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {techLeave && (
        <div className="no-print mx-auto mb-4 max-w-3xl rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <b>{techLeave.user.name || techLeave.user.email}</b> is on {LEAVE_TYPE_LABELS[techLeave.type].toLowerCase()}
          {techLeave.halfDay ? " (half day)" : ""} on the day this job is booked. Reassign it or move the date.
        </div>
      )}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-charcoal-500">Mark as:</span>
        {(["IN_PROGRESS", "CANCELLED"] as const)
          .filter((s) => s !== j.status && (s !== "CANCELLED" || may("jobcards.assign")))
          .map((s) => (
            <form key={s} action={setJobCardStatus}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="status" value={s} />
              <button className="btn-outline py-1 text-xs">{s.replace("_", " ").toLowerCase()}</button>
            </form>
          ))}
        {j.status !== "COMPLETED" && j.status !== "CANCELLED" && may("jobcards.edit") && (
          <Link href={`/sign/${j.id}`} className="btn-primary py-1 text-xs">Client sign-off on this phone</Link>
        )}
        {customStatuses.length > 0 && (
          <form action={setJobCardStatus} className="flex items-center gap-1">
            <input type="hidden" name="id" value={j.id} />
            <select name="status" className="input w-auto py-1 text-xs" aria-label="Custom status" defaultValue="">
              <option value="" disabled>Other status…</option>
              {customStatuses.map((c) => <option key={c.id} value={`${CUSTOM_PREFIX}${c.id}`}>{c.name}</option>)}
            </select>
            <button className="btn-outline py-1 text-xs">Set</button>
          </form>
        )}
        <span className="ml-auto flex flex-wrap gap-3">
          {j.quotation && may("quotations.view") && <Link href={`/quotations/${j.quotation.id}`} className="text-kudu-600 hover:underline">Quotation {j.quotation.number}</Link>}
          {may("queries.view") && j.queries.map((qr) => (
            <Link key={qr.id} href={`/queries/${qr.id}`} className="text-kudu-600 hover:underline">Query {qr.number}{isOpen(qr.status) ? " (open)" : ""}</Link>
          ))}
          {may("queries.edit") && <Link href={`/queries/new?customerId=${j.customerId}&jobCardId=${j.id}`} className="text-charcoal-500 hover:text-kudu-600">+ Log query</Link>}
          {may("invoices.view") && j.invoices.map((i) => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="text-kudu-600 hover:underline">Invoice {i.number}</Link>
          ))}
        </span>
      </div>

      <JobCardSheet j={j} settings={settings} showFeedback />

      <TimeSection
        jobCardId={j.id}
        entries={j.timeEntries}
        user={user}
        people={people}
        settings={settings}
        hasDraftInvoice={j.invoices.some((i) => i.status === "DRAFT")}
      />

      <LinkedTasks db={db} user={user} link={{ jobCardId: j.id }} returnTo={`/job-cards/${j.id}`} className="mx-auto mt-6 max-w-3xl" />
      <LinkedForms db={db} user={user} link={{ jobCardId: j.id }} className="mx-auto mt-6 max-w-3xl" />
      <LinkedDocuments db={db} user={user} link={{ jobCardId: j.id }} subject="job" subjectId={j.id} returnTo={`/job-cards/${j.id}`} className="mx-auto mt-6 max-w-3xl" />

      <StatusHistory changes={j.statusChanges} createdAt={j.createdAt} trackedSince={settings.statusTrackingSince} />

      <JobAssetsSection jobCardId={j.id} assets={customerAssets} checks={j.assetChecks} />

      <StockSection
        jobCardId={j.id}
        used={j.stockMovements}
        user={user}
        locations={stockLocations}
        items={stockItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit, onHand: Object.fromEntries(i.levels.map((l) => [l.locationId, l.quantity])) }))}
        hasDraftInvoice={j.invoices.some((i) => i.status === "DRAFT")}
        symbol={settings.currencySymbol}
      />

      {may("jobcards.delete") && (
        <form action={deleteJobCard} className="no-print mx-auto mt-6 max-w-3xl text-right">
          <input type="hidden" name="id" value={j.id} />
          <ConfirmButton message={`Delete job card ${j.number}, its photos and its calendar event?`}>Delete job card</ConfirmButton>
        </form>
      )}
    </div>
  );
}

/** Every status the job has had, who moved it and how long it stayed (on screen only). */
function StatusHistory({
  changes,
  createdAt,
  trackedSince,
}: {
  changes: { id: string; fromName: string; toName: string; toStatus: string; changedAt: Date; byName: string }[];
  createdAt: Date;
  trackedSince: Date;
}) {
  if (!changes.length) return null;
  const now = Date.now();
  return (
    <section className="no-print card mx-auto mt-6 max-w-3xl p-6">
      <h2 className="mb-3 border-b border-charcoal-100 pb-2 text-sm font-bold uppercase tracking-wide text-kudu-600">Status history</h2>
      <ol className="space-y-2 text-sm">
        {createdAt < trackedSince && <li className="text-xs text-charcoal-500">Changes before {fmtDateTime(trackedSince)} were not recorded.</li>}
        {changes.map((c, i) => {
          const until = changes[i + 1]?.changedAt.getTime() ?? now;
          return (
            <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-2 border-l-2 border-kudu-200 pl-3">
              <span>
                <b>{c.toName}</b>
                {c.fromName ? <span className="text-charcoal-500"> from {c.fromName}</span> : <span className="text-charcoal-500"> (created)</span>}
                {c.byName && <span className="text-charcoal-500"> · {c.byName}</span>}
              </span>
              <span className="text-xs text-charcoal-500">
                {fmtDateTime(c.changedAt)}
                {i + 1 < changes.length
                  ? ` · for ${fmtDuration(until - c.changedAt.getTime())}`
                  : c.toStatus === "COMPLETED" || c.toStatus === "CANCELLED"
                    ? ""
                    : ` · ${fmtDuration(until - c.changedAt.getTime())} so far`}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
