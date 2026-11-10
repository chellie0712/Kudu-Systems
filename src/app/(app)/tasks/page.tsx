import Link from "next/link";
import { TaskStatus, type Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";
import { escalateOverdue, OPEN_TASK, TASK_ORDER, TASK_ROW_INCLUDE, TASK_STATUS_LABELS, taskScope } from "@/lib/tasks";
import { Flash, PageHeader } from "@/components/ui";
import { TaskTable } from "@/components/Tasks";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string; msg?: string; err?: string }> }) {
  const user = await requirePermission("tasks.view");
  const db = await tenantDb();
  await escalateOverdue(db, await getSettings());
  const all = can(user, "tasks.viewAll");
  const { view = "mine", status, q = "", msg, err } = await searchParams;
  const now = new Date();
  const open = { status: { in: OPEN_TASK } };
  const views: { key: string; label: string; where: Prisma.TaskWhereInput }[] = [
    { key: "mine", label: "My tasks", where: { ...open, assignedToId: user.id } },
    { key: "created", label: "I gave out", where: { ...open, createdById: user.id, NOT: { assignedToId: user.id } } },
    ...(all ? [{ key: "team", label: "Everyone's open", where: open }] : []),
    { key: "overdue", label: "Overdue", where: { ...open, dueAt: { lt: now } } },
    {
      key: "escalated",
      label: "Escalated",
      where: { ...open, escalatedAt: { not: null }, ...(all ? {} : { OR: [{ escalatedToId: user.id }, { assignedToId: user.id }] }) },
    },
    ...(all ? [{ key: "unassigned", label: "Nobody assigned", where: { ...open, assignedToId: null } }] : []),
    { key: "done", label: "Done", where: { status: { in: [TaskStatus.DONE, TaskStatus.CANCELLED] } } },
  ];
  const current = views.find((v) => v.key === view) ?? views[0];
  const rows = await db.task.findMany({
    where: {
      AND: [
        taskScope(user),
        current.where,
        status && status in TaskStatus ? { status: status as TaskStatus } : {},
        q
          ? {
              OR: [
                { number: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
                { category: { contains: q, mode: "insensitive" } },
                { customer: { name: { contains: q, mode: "insensitive" } } },
              ],
            }
          : {},
      ],
    },
    include: TASK_ROW_INCLUDE,
    orderBy: current.key === "done" ? [{ completedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }] : TASK_ORDER,
    take: 300,
  });
  const returnTo = `/tasks?view=${current.key}`;

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle="Work for one person with a deadline. Overdue tasks are escalated automatically."
        actions={
          <>
            {can(user, "settings.manage") && <Link href="/settings/tasks" className="btn-outline">Rules &amp; escalation</Link>}
            {can(user, "tasks.edit") && <Link href="/tasks/new" className="btn-primary">+ New task</Link>}
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <div className="mb-3 flex flex-wrap gap-1">
        {views.map((v) => (
          <Link
            key={v.key}
            href={`/tasks?view=${v.key}`}
            className={`rounded-full px-3 py-1 text-sm font-medium ${current.key === v.key ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200 hover:text-kudu-600"}`}
          >
            {v.label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value={current.key} />
        <input name="q" defaultValue={q} placeholder="Search number, task, type or customer" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ""} className="input w-auto">
          <option value="">Any status</option>
          {(Object.keys(TASK_STATUS_LABELS) as TaskStatus[]).map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
        </select>
        <button className="btn-dark">Filter</button>
        {(status || q) && <Link href={returnTo} className="text-sm text-charcoal-500 hover:text-kudu-600">Clear</Link>}
      </form>
      <div className="card overflow-x-auto">
        <TaskTable rows={rows} returnTo={returnTo} doneButton={can(user, "tasks.edit")} access={user} />
      </div>
    </div>
  );
}
