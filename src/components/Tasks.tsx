import Link from "next/link";
import type { Task, TaskPriority, TaskStatus } from "@prisma/client";
import type { AppUser } from "@/auth";
import type { TenantDb } from "@/lib/db";
import { can, type Access } from "@/lib/permissions";
import { setTaskStatus } from "@/app/actions/tasks";
import { fmtDateTime, toDateTimeInput } from "@/lib/format";
import { isOpenTask, isTaskOverdue, TASK_ORDER, taskScope, TASK_CATEGORIES, TASK_PRIORITY_COLOURS, TASK_PRIORITY_LABELS, TASK_STATUS_COLOURS, TASK_STATUS_LABELS } from "@/lib/tasks";
import { Empty } from "./ui";

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TASK_STATUS_COLOURS[status]}`}>{TASK_STATUS_LABELS[status]}</span>;
}

export const TaskPriorityText = ({ priority }: { priority: TaskPriority }) => <span className={TASK_PRIORITY_COLOURS[priority]}>{TASK_PRIORITY_LABELS[priority]}</span>;

export type TaskRow = Task & {
  assignedTo: { name: string | null; email: string | null } | null;
  customer: { id: string; name: string } | null;
  jobCard: { id: string; number: string } | null;
  quotation: { id: string; number: string } | null;
  invoice: { id: string; number: string } | null;
  query: { id: string; number: string } | null;
};

/** The records a task is linked to, as links (plain text where `access` can't open them). */
export function TaskLinks({ t, access }: { t: Pick<TaskRow, "customer" | "jobCard" | "quotation" | "invoice" | "query">; access?: Access }) {
  const may = (p: Parameters<typeof can>[1]) => !access || can(access, p);
  const links = [
    t.customer && { href: may("customers.view") ? `/customers/${t.customer.id}?tab=tasks` : "", label: t.customer.name },
    t.jobCard && { href: `/job-cards/${t.jobCard.id}`, label: t.jobCard.number },
    t.quotation && { href: may("quotations.view") ? `/quotations/${t.quotation.id}` : "", label: t.quotation.number },
    t.invoice && { href: may("invoices.view") ? `/invoices/${t.invoice.id}` : "", label: t.invoice.number },
    t.query && { href: may("queries.view") ? `/queries/${t.query.id}` : "", label: t.query.number },
  ].filter(Boolean) as { href: string; label: string }[];
  if (!links.length) return null;
  return (
    <span className="text-xs text-charcoal-500">
      {links.map((l, i) => (
        <span key={l.label}>
          {i > 0 && " · "}
          {l.href ? <Link href={l.href} className="hover:text-kudu-600">{l.label}</Link> : l.label}
        </span>
      ))}
    </span>
  );
}

/** Tasks as a table; `doneButton` adds a one-click "Done" for open tasks. */
export function TaskTable({ rows, returnTo, doneButton = true, access }: { rows: TaskRow[]; returnTo: string; doneButton?: boolean; access?: Access }) {
  if (!rows.length) return <Empty>No tasks here.</Empty>;
  const now = new Date();
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Task</th>
          <th>Priority</th>
          <th>Status</th>
          <th>Assigned to</th>
          <th>Deadline</th>
          {doneButton && <th></th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((t) => {
          const overdue = isTaskOverdue(t, now);
          return (
            <tr key={t.id}>
              <td>
                <Link href={`/tasks/${t.id}`} className="font-semibold text-kudu-700 hover:underline">{t.title}</Link>
                <div className="text-xs text-charcoal-500">
                  {t.number}
                  {t.category && ` · ${t.category}`}
                  {t.escalatedAt && isOpenTask(t.status) && <span className="ml-1 rounded bg-kudu-600 px-1.5 py-0.5 font-semibold text-white">Escalated</span>}
                </div>
                <TaskLinks t={t} access={access} />
              </td>
              <td className="text-sm"><TaskPriorityText priority={t.priority} /></td>
              <td><TaskStatusBadge status={t.status} /></td>
              <td className="text-sm">
                {t.assignedTo ? t.assignedTo.name || t.assignedTo.email : <span className="text-charcoal-400">Nobody</span>}
                {t.assignedBy.startsWith("Rule:") && <div className="text-xs text-charcoal-400">{t.assignedBy}</div>}
              </td>
              <td className={`text-sm whitespace-nowrap ${overdue ? "font-semibold text-kudu-700" : ""}`}>
                {t.dueAt ? fmtDateTime(t.dueAt) : "—"}
                {overdue && <div className="text-xs">overdue</div>}
              </td>
              {doneButton && (
                <td>
                  {isOpenTask(t.status) && (
                    <form action={setTaskStatus}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value="DONE" />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button className="btn-outline py-1 text-xs" title="Mark done">✓ Done</button>
                    </form>
                  )}
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Title, details, type, priority, deadline and (optionally) who it is for. */
export function TaskFields({
  task,
  people,
  canAssign,
  hasRules,
  meId,
}: {
  task?: Task;
  people: { id: string; name: string }[];
  canAssign: boolean;
  hasRules: boolean;
  meId: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <label className="block sm:col-span-6">
        <span className="label">Task *</span>
        <input name="title" required maxLength={200} defaultValue={task?.title} className="input" placeholder="e.g. Call Thandi about the follow-up visit" />
      </label>
      <label className="block sm:col-span-6">
        <span className="label">Details</span>
        <textarea name="description" rows={3} defaultValue={task?.description} className="input" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Type</span>
        <input name="category" list="task-categories" defaultValue={task?.category} className="input" />
        <datalist id="task-categories">{TASK_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Priority</span>
        <select name="priority" defaultValue={task?.priority ?? "NORMAL"} className="input">
          {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Deadline</span>
        <input name="dueAt" type="datetime-local" defaultValue={toDateTimeInput(task?.dueAt ?? null)} className="input" />
      </label>
      {(canAssign || !task) && (
        <label className="block sm:col-span-6">
          <span className="label">Assign to</span>
          <select name="assignedToId" defaultValue={task ? task.assignedToId ?? "" : hasRules ? "auto" : meId} className="input">
            {hasRules && <option value="auto">Automatically (assignment rules)</option>}
            {task && <option value="">Nobody</option>}
            <option value={meId}>Me</option>
            {canAssign && people.filter((p) => p.id !== meId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}

/**
 * The tasks about one record (job card, quotation, invoice or query) as a small card, with
 * "+ Task" to add one linked to it. Shows nothing to people without task access.
 */
export async function LinkedTasks({
  db,
  user,
  link,
  returnTo,
  className = "",
}: {
  db: TenantDb;
  user: AppUser;
  link: { jobCardId: string } | { quotationId: string } | { invoiceId: string } | { queryId: string };
  returnTo: string;
  className?: string;
}) {
  if (!can(user, "tasks.view")) return null;
  const tasks = await db.task.findMany({
    where: { AND: [link, taskScope(user)] },
    include: { assignedTo: { select: { name: true, email: true } } },
    orderBy: TASK_ORDER,
    take: 50,
  });
  const open = tasks.filter((t) => isOpenTask(t.status));
  const closed = tasks.length - open.length;
  const params = new URLSearchParams({ ...link, returnTo });
  const now = new Date();
  return (
    <section className={`no-print card p-5 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-charcoal-700 uppercase">Tasks</h2>
        {can(user, "tasks.edit") && <Link href={`/tasks/new?${params}`} className="btn-outline py-1 text-xs">+ Task</Link>}
      </div>
      {open.length === 0 ? (
        <p className="text-sm text-charcoal-500">No open tasks.{closed ? ` ${closed} done or cancelled.` : ""}</p>
      ) : (
        <ul className="divide-y divide-charcoal-100 text-sm">
          {open.map((t) => {
            const overdue = isTaskOverdue(t, now);
            return (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <Link href={`/tasks/${t.id}`} className="font-medium text-kudu-700 hover:underline">{t.title}</Link>
                  <div className="text-xs text-charcoal-500">
                    {t.assignedTo ? t.assignedTo.name || t.assignedTo.email : "Nobody"}
                    {t.dueAt && <span className={overdue ? "font-semibold text-kudu-700" : ""}> · {fmtDateTime(t.dueAt)}{overdue && " (overdue)"}</span>}
                  </div>
                </div>
                <TaskStatusBadge status={t.status} />
              </li>
            );
          })}
        </ul>
      )}
      {closed > 0 && open.length > 0 && <p className="mt-2 text-xs text-charcoal-500">{closed} done or cancelled.</p>}
    </section>
  );
}
