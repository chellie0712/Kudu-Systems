import Link from "next/link";
import { notFound } from "next/navigation";
import type { QueryStatus } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { isOpen, isOverdue, QUERY_STATUS_LABELS } from "@/lib/queries";
import { staffList } from "@/lib/queriesServer";
import { addQueryNote, createJobCardFromQuery, deleteQuery, setQueryStatus, updateQuery } from "@/app/actions/queries";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { PriorityText, QueryFields, QueryStatusBadge } from "@/components/Queries";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { ConfirmButton } from "@/components/ConfirmButton";

export default async function QueryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("queries.view");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const q = await db.query.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true, phone: true, email: true, contactPerson: true } },
      assignedTo: { select: { name: true, email: true } },
      jobCard: { select: { id: true, number: true, status: true, scheduledStart: true, customStatus: { select: { name: true, colour: true } } } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!q) notFound();
  const edit = can(user.role, "queries.edit");
  const staff = edit ? await staffList(db, q.assignedToId) : [];
  const overdue = isOverdue(q);
  const nextStatuses = (Object.keys(QUERY_STATUS_LABELS) as QueryStatus[]).filter((s) => s !== q.status);

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/queries", label: "Queries" }}
        title={<span className="flex items-center gap-3">{q.number} <QueryStatusBadge status={q.status} /></span>}
        subtitle={q.subject}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">Customer</div>
          <Link href={`/customers/${q.customer.id}?tab=queries`} className="font-semibold text-kudu-700 hover:underline">{q.customer.name}</Link>
          <div className="text-charcoal-600">{[q.customer.contactPerson, q.customer.phone].filter(Boolean).join(" · ")}</div>
          {q.customer.email && <div className="text-charcoal-600">{q.customer.email}</div>}
        </div>
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">Priority · type</div>
          <div><PriorityText priority={q.priority} />{q.category && ` · ${q.category}`}</div>
          <div className="text-charcoal-600">{q.source && `Received by ${q.source.toLowerCase()} · `}logged {fmtDate(q.createdAt)} by {q.createdBy || "?"}</div>
        </div>
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">Assigned · due</div>
          <div>{q.assignedTo ? q.assignedTo.name || q.assignedTo.email : <span className="text-charcoal-400">Nobody</span>}</div>
          <div className={overdue ? "font-semibold text-kudu-700" : "text-charcoal-600"}>{q.dueAt ? `Respond by ${fmtDate(q.dueAt)}${overdue ? " · overdue" : ""}` : "No due date"}</div>
        </div>
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">Job card</div>
          {q.jobCard ? (
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/job-cards/${q.jobCard.id}`} className="font-semibold text-kudu-700 hover:underline">{q.jobCard.number}</Link>
              <JobStatusBadge status={q.jobCard.status} custom={q.jobCard.customStatus} />
              {q.jobCard.scheduledStart && <span className="text-charcoal-600">{fmtDateTime(q.jobCard.scheduledStart)}</span>}
            </div>
          ) : (
            <span className="text-charcoal-400">None</span>
          )}
          {edit && can(user.role, "jobcards.create") && isOpen(q.status) && (
            <form action={createJobCardFromQuery}>
              <input type="hidden" name="id" value={q.id} />
              <button className="btn-outline mt-2 py-1 text-xs">{q.jobCard ? "Create follow-up job card" : "Create job card"}</button>
            </form>
          )}
        </div>
      </div>

      {q.description && (
        <div className="card mb-6 p-6">
          <SectionTitle>Details</SectionTitle>
          <p className="text-sm whitespace-pre-line">{q.description}</p>
        </div>
      )}

      {(q.resolution || !isOpen(q.status)) && (
        <div className="card mb-6 border-l-4 border-l-emerald-500 p-6">
          <SectionTitle>Resolution</SectionTitle>
          <p className="text-sm whitespace-pre-line">{q.resolution || "—"}</p>
          {q.resolvedAt && <p className="mt-1 text-xs text-charcoal-500">Resolved {fmtDateTime(q.resolvedAt)}</p>}
        </div>
      )}

      {edit && (
        <div className="card mb-6 p-6">
          <SectionTitle>Update</SectionTitle>
          <form action={addQueryNote} className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="id" value={q.id} />
            <label className="block min-w-60 flex-1">
              <span className="label">Add a note</span>
              <textarea name="text" rows={2} required className="input" placeholder="e.g. Called the customer, booked a re-service for Tuesday" />
            </label>
            <button className="btn-primary">Add note</button>
          </form>
          <form action={setQueryStatus} className="flex flex-wrap items-end gap-2 border-t border-charcoal-100 pt-4">
            <input type="hidden" name="id" value={q.id} />
            <label className="block w-52">
              <span className="label">Change status to</span>
              <select name="status" className="input" defaultValue={isOpen(q.status) ? "RESOLVED" : "OPEN"}>
                {nextStatuses.map((s) => <option key={s} value={s}>{QUERY_STATUS_LABELS[s]}</option>)}
              </select>
            </label>
            <label className="block min-w-60 flex-1">
              <span className="label">Resolution (needed to resolve or close)</span>
              <input name="resolution" className="input" defaultValue={q.resolution} placeholder="How it was sorted out" />
            </label>
            <button className="btn-dark">Set status</button>
          </form>
        </div>
      )}

      <div className="card mb-6 p-6">
        <SectionTitle>Timeline</SectionTitle>
        <ol className="space-y-3">
          {q.notes.map((n) => (
            <li key={n.id} className={`border-l-2 pl-3 text-sm ${n.system ? "border-charcoal-200 text-charcoal-500" : "border-kudu-600"}`}>
              <div className={n.system ? "" : "whitespace-pre-line text-charcoal-800"}>{n.text}</div>
              <div className="text-xs text-charcoal-400">{fmtDateTime(n.createdAt)} · {n.userName}</div>
            </li>
          ))}
        </ol>
      </div>

      {edit && (
        <details className="card mb-6 p-6">
          <summary className="cursor-pointer text-sm font-semibold text-kudu-600">Edit details, priority, assignment and due date</summary>
          <form action={updateQuery} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={q.id} />
            <QueryFields query={q} staff={staff} />
            <button className="btn-primary">Save query</button>
          </form>
        </details>
      )}

      {can(user.role, "queries.delete") && (
        <form action={deleteQuery} className="text-right">
          <input type="hidden" name="id" value={q.id} />
          <ConfirmButton message={`Delete query ${q.number} and its timeline?`}>Delete query</ConfirmButton>
        </form>
      )}
    </div>
  );
}
