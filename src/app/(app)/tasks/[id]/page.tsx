import { notFound } from "next/navigation";
import type { TaskStatus } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";
import { assignees } from "@/lib/assignees";
import { fmtDateTime } from "@/lib/format";
import { canSeeTask, escalateOverdue, isOpenTask, isTaskOverdue } from "@/lib/tasks";
import { addTaskNote, deleteTask, setTaskStatus, takeTask, updateTask } from "@/app/actions/tasks";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { TaskFields, TaskLinks, TaskPriorityText, TaskStatusBadge } from "@/components/Tasks";
import { ConfirmButton } from "@/components/ConfirmButton";

const STATUS_BUTTONS: Record<TaskStatus, { status: TaskStatus; label: string; primary?: boolean }[]> = {
  OPEN: [{ status: "IN_PROGRESS", label: "Start" }, { status: "DONE", label: "✓ Done", primary: true }, { status: "CANCELLED", label: "Cancel task" }],
  IN_PROGRESS: [{ status: "DONE", label: "✓ Done", primary: true }, { status: "OPEN", label: "Back to To do" }, { status: "CANCELLED", label: "Cancel task" }],
  DONE: [{ status: "OPEN", label: "Reopen" }],
  CANCELLED: [{ status: "OPEN", label: "Reopen" }],
};

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("tasks.view");
  const db = await tenantDb();
  await escalateOverdue(db, await getSettings());
  const { id } = await params;
  const { msg, err } = await searchParams;
  const t = await db.task.findUnique({
    where: { id },
    include: {
      assignedTo: { select: { name: true, email: true } },
      escalatedTo: { select: { name: true, email: true } },
      customer: { select: { id: true, name: true } },
      jobCard: { select: { id: true, number: true } },
      quotation: { select: { id: true, number: true } },
      invoice: { select: { id: true, number: true } },
      query: { select: { id: true, number: true } },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!t || !canSeeTask(user, t)) notFound();
  const edit = can(user, "tasks.edit");
  const canAssign = can(user, "tasks.assign");
  const [people, rules] = edit ? await Promise.all([canAssign ? assignees(db, t.assignedToId) : Promise.resolve([]), db.assignmentRule.count({ where: { active: true } })]) : [[], 0];
  const overdue = isTaskOverdue(t);
  const open = isOpenTask(t.status);

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/tasks", label: "Tasks" }}
        title={<span className="flex flex-wrap items-center gap-3">{t.title} <TaskStatusBadge status={t.status} /></span>}
        subtitle={`${t.number}${t.category ? ` · ${t.category}` : ""} · added ${fmtDateTime(t.createdAt)} by ${t.createdBy || "?"}`}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {t.escalatedAt && open && (
        <div className="mb-4 rounded-md border border-kudu-200 bg-kudu-50 px-4 py-3 text-sm text-kudu-800">
          Escalated {fmtDateTime(t.escalatedAt)} to {t.escalatedTo ? t.escalatedTo.name || t.escalatedTo.email : "the managers"} because it is overdue.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">Assigned to</div>
          <div className="font-semibold">{t.assignedTo ? t.assignedTo.name || t.assignedTo.email : <span className="text-charcoal-400">Nobody</span>}</div>
          {t.assignedBy && <div className="text-charcoal-500">by {t.assignedBy}</div>}
          {edit && open && t.assignedToId !== user.id && (canAssign || !t.assignedToId) && (
            <form action={takeTask}>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn-outline mt-2 py-1 text-xs">Assign to me</button>
            </form>
          )}
        </div>
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">Deadline · priority</div>
          <div className={overdue ? "font-semibold text-kudu-700" : ""}>{t.dueAt ? fmtDateTime(t.dueAt) : "No deadline"}{overdue && " · overdue"}</div>
          <TaskPriorityText priority={t.priority} />
          {t.completedAt && t.status === "DONE" && <div className="text-charcoal-500">Done {fmtDateTime(t.completedAt)}</div>}
        </div>
        <div className="card p-4 text-sm">
          <div className="text-xs font-semibold text-charcoal-500 uppercase">About</div>
          <TaskLinks t={t} access={user} />
          {!t.customer && !t.jobCard && !t.quotation && !t.invoice && !t.query && <span className="text-charcoal-400">Nothing linked</span>}
        </div>
      </div>

      {t.description && (
        <div className="card mb-6 p-6">
          <SectionTitle>Details</SectionTitle>
          <p className="text-sm whitespace-pre-line">{t.description}</p>
        </div>
      )}

      {edit && (
        <div className="card mb-6 p-6">
          <div className="mb-4 flex flex-wrap gap-2">
            {STATUS_BUTTONS[t.status].map((b) => (
              <form key={b.status} action={setTaskStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value={b.status} />
                <button className={b.primary ? "btn-primary" : "btn-outline"}>{b.label}</button>
              </form>
            ))}
          </div>
          <form action={addTaskNote} className="flex flex-wrap items-end gap-2 border-t border-charcoal-100 pt-4">
            <input type="hidden" name="id" value={t.id} />
            <label className="block min-w-60 flex-1">
              <span className="label">Add a note</span>
              <textarea name="text" rows={2} required className="input" placeholder="e.g. Left a voicemail, trying again tomorrow" />
            </label>
            <button className="btn-dark">Add note</button>
          </form>
        </div>
      )}

      <div className="card mb-6 p-6">
        <SectionTitle>Timeline</SectionTitle>
        <ol className="space-y-3">
          {t.notes.map((n) => (
            <li key={n.id} className={`border-l-2 pl-3 text-sm ${n.system ? "border-charcoal-200 text-charcoal-500" : "border-kudu-600"}`}>
              <div className={n.system ? "" : "whitespace-pre-line text-charcoal-800"}>{n.text}</div>
              <div className="text-xs text-charcoal-400">{fmtDateTime(n.createdAt)} · {n.userName}</div>
            </li>
          ))}
        </ol>
      </div>

      {edit && (
        <details className="card mb-6 p-6">
          <summary className="cursor-pointer text-sm font-semibold text-kudu-600">Edit task, deadline{canAssign ? " and who it is for" : ""}</summary>
          <form action={updateTask} className="mt-4 space-y-4">
            <input type="hidden" name="id" value={t.id} />
            <TaskFields task={t} people={people} canAssign={canAssign} hasRules={rules > 0} meId={user.id} />
            <button className="btn-primary">Save task</button>
          </form>
        </details>
      )}

      {can(user, "tasks.delete") && (
        <form action={deleteTask} className="text-right">
          <input type="hidden" name="id" value={t.id} />
          <ConfirmButton message={`Delete task ${t.number}? Its notes go too.`} className="text-sm text-kudu-700 hover:underline">Delete task</ConfirmButton>
        </form>
      )}
    </div>
  );
}
