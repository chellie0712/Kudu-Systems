import Link from "next/link";
import type { Query, QueryPriority, QueryStatus } from "@prisma/client";
import { fmtDate, toDateInput } from "@/lib/format";
import { isOverdue, PRIORITY_COLOURS, PRIORITY_LABELS, QUERY_CATEGORIES, QUERY_SOURCES, QUERY_STATUS_COLOURS, QUERY_STATUS_LABELS } from "@/lib/queries";
import { Empty } from "./ui";

export function QueryStatusBadge({ status }: { status: QueryStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${QUERY_STATUS_COLOURS[status]}`}>{QUERY_STATUS_LABELS[status]}</span>;
}

export const PriorityText = ({ priority }: { priority: QueryPriority }) => <span className={PRIORITY_COLOURS[priority]}>{PRIORITY_LABELS[priority]}</span>;

type Row = Query & { customer: { id: string; name: string }; assignedTo: { name: string | null; email: string | null } | null };

export function QueryTable({ rows, showCustomer = true }: { rows: Row[]; showCustomer?: boolean }) {
  if (!rows.length) return <Empty>No queries found.</Empty>;
  const now = new Date();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Query</th>
          {showCustomer && <th>Customer</th>}
          <th>Priority</th>
          <th>Status</th>
          <th>Assigned to</th>
          <th>Due</th>
          <th>Logged</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => (
          <tr key={q.id}>
            <td>
              <Link href={`/queries/${q.id}`} className="font-semibold text-kudu-700 hover:underline">{q.number}</Link>
              <div className="text-sm">{q.subject}</div>
              {q.category && <div className="text-xs text-charcoal-500">{q.category}</div>}
            </td>
            {showCustomer && <td><Link href={`/customers/${q.customer.id}?tab=queries`} className="hover:text-kudu-600">{q.customer.name}</Link></td>}
            <td className="text-sm"><PriorityText priority={q.priority} /></td>
            <td><QueryStatusBadge status={q.status} /></td>
            <td className="text-sm">{q.assignedTo ? q.assignedTo.name || q.assignedTo.email : <span className="text-charcoal-400">Nobody</span>}</td>
            <td className={`text-sm whitespace-nowrap ${isOverdue(q, now) ? "font-semibold text-kudu-700" : ""}`}>{q.dueAt ? fmtDate(q.dueAt) : "—"}{isOverdue(q, now) && " · overdue"}</td>
            <td className="text-sm whitespace-nowrap">{fmtDate(q.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The editable fields of a query (new and edit). */
export function QueryFields({
  query,
  staff,
  customers,
  customerId,
}: {
  query?: Query;
  staff: { id: string; name: string }[];
  /** Shown as a picker on a new query when no customer was given. */
  customers?: { id: string; name: string }[];
  customerId?: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      {customers ? (
        <label className="block sm:col-span-3">
          <span className="label">Customer *</span>
          <select name="customerId" required className="input" defaultValue={customerId ?? ""}>
            <option value="" disabled>Choose…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      ) : (
        customerId && <input type="hidden" name="customerId" value={customerId} />
      )}
      <label className={`block ${customers ? "sm:col-span-3" : "sm:col-span-6"}`}>
        <span className="label">Subject *</span>
        <input name="subject" required defaultValue={query?.subject} className="input" placeholder="e.g. Cockroaches back in the kitchen" />
      </label>
      <label className="block sm:col-span-6">
        <span className="label">Details</span>
        <textarea name="description" rows={3} defaultValue={query?.description} className="input" placeholder="What the customer said, where, since when…" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Type</span>
        <input name="category" list="query-categories" defaultValue={query?.category} className="input" />
        <datalist id="query-categories">{QUERY_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Received by</span>
        <input name="source" list="query-sources" defaultValue={query?.source} className="input" />
        <datalist id="query-sources">{QUERY_SOURCES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Priority</span>
        <select name="priority" defaultValue={query?.priority ?? "NORMAL"} className="input">
          {(Object.keys(PRIORITY_LABELS) as QueryPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-3">
        <span className="label">Assigned to</span>
        <select name="assignedToId" defaultValue={query?.assignedToId ?? ""} className="input">
          <option value="">Nobody yet</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-3">
        <span className="label">Respond by</span>
        <input name="dueAt" type="date" defaultValue={toDateInput(query?.dueAt ?? null)} className="input" />
      </label>
    </div>
  );
}
