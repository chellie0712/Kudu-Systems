"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AssignMethod, TaskPriority, TaskStatus, type Prisma } from "@prisma/client";
import { requirePermission, type AppUser } from "@/auth";
import { tenantDb, type TenantDb } from "@/lib/db";
import { can, CUSTOM_ROLE_PREFIX, isRole } from "@/lib/permissions";
import { optDate, str } from "@/lib/form";
import { fmtDateTime } from "@/lib/format";
import { nextNumber } from "@/lib/settings";
import { autoAssign, canSeeTask, TASK_STATUS_LABELS } from "@/lib/tasks";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const priorityFrom = (raw: string) => (raw in TaskPriority ? (raw as TaskPriority) : TaskPriority.NORMAL);

async function userName(db: TenantDb, id: string | null): Promise<string> {
  if (!id) return "nobody";
  const u = await db.user.findUnique({ where: { id }, select: { name: true, email: true } });
  return u?.name || u?.email || "a removed user";
}

/**
 * Who a task goes to, from the form's "Assign to": "auto" (the assignment rules), "me", or a
 * user id. Giving it to someone else needs "Give tasks to other people".
 */
async function chooseAssignee(db: TenantDb, user: AppUser, raw: string, task: { category: string; priority: TaskPriority; customerId: string | null }) {
  if (raw === "auto") {
    const picked = await autoAssign(db, task);
    if (picked) return { assignedToId: picked.userId, assignedBy: `Rule: ${picked.ruleName}`, note: `Assigned to ${picked.userName} by the rule “${picked.ruleName}”` };
    return { assignedToId: null, assignedBy: "", note: "No assignment rule matched, so nobody was assigned" };
  }
  if (!raw || raw === "me" || raw === user.id) return { assignedToId: user.id, assignedBy: user.name, note: `Assigned to ${user.name}` };
  if (!can(user, "tasks.assign")) return { assignedToId: user.id, assignedBy: user.name, note: `Assigned to ${user.name}` };
  const u = await db.user.findFirst({ where: { id: raw, disabled: false }, select: { id: true, name: true, email: true } });
  if (!u) return { assignedToId: null, assignedBy: "", note: "Not assigned" };
  return { assignedToId: u.id, assignedBy: user.name, note: `Assigned to ${u.name || u.email} by ${user.name}` };
}

/** The records a task is about, checked to exist. A linked document also sets the customer. */
async function linksFrom(db: TenantDb, fd: FormData) {
  const pick = async <T extends { id: string; customerId?: string | null }>(id: string, find: (id: string) => Promise<T | null>) => (id ? await find(id) : null);
  const jobCard = await pick(str(fd, "jobCardId"), (id) => db.jobCard.findUnique({ where: { id }, select: { id: true, customerId: true } }));
  const quotation = await pick(str(fd, "quotationId"), (id) => db.quotation.findUnique({ where: { id }, select: { id: true, customerId: true } }));
  const invoice = await pick(str(fd, "invoiceId"), (id) => db.invoice.findUnique({ where: { id }, select: { id: true, customerId: true } }));
  const query = await pick(str(fd, "queryId"), (id) => db.query.findUnique({ where: { id }, select: { id: true, customerId: true } }));
  const customer = await pick(str(fd, "customerId"), (id) => db.customer.findUnique({ where: { id }, select: { id: true } }));
  return {
    customerId: customer?.id ?? jobCard?.customerId ?? quotation?.customerId ?? invoice?.customerId ?? query?.customerId ?? null,
    jobCardId: jobCard?.id ?? null,
    quotationId: quotation?.id ?? null,
    invoiceId: invoice?.id ?? null,
    queryId: query?.id ?? null,
  };
}

async function taskFor(db: TenantDb, user: AppUser, id: string) {
  const t = await db.task.findUnique({ where: { id } });
  if (!t || !canSeeTask(user, t)) redirect("/tasks?err=Task+not+found");
  return t;
}

export async function createTask(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("tasks.edit");
  const title = str(fd, "title").slice(0, 200);
  if (!title) go("/tasks/new", "err", "Give the task a title.");
  const category = str(fd, "category").slice(0, 80);
  const priority = priorityFrom(str(fd, "priority"));
  const links = await linksFrom(db, fd);
  const who = await chooseAssignee(db, user, str(fd, "assignedToId"), { category, priority, customerId: links.customerId });
  const t = await db.task.create({
    data: {
      number: await nextNumber("task"),
      title,
      description: str(fd, "description").slice(0, 5000),
      category,
      priority,
      dueAt: optDate(fd, "dueAt"),
      assignedToId: who.assignedToId,
      assignedBy: who.assignedBy,
      ...links,
      createdById: user.id,
      createdBy: user.name,
      // A millisecond apart so the timeline shows them in order.
      notes: {
        create: [
          { text: "Task created", system: true, userName: user.name, createdAt: new Date(Date.now() - 1) },
          { text: who.note, system: true, userName: user.name },
        ],
      },
    },
  });
  revalidatePath("/tasks");
  const back = str(fd, "returnTo");
  if (back.startsWith("/") && !back.startsWith("//")) go(back, "msg", `Task ${t.number} added`);
  redirect(`/tasks/${t.id}?msg=Task+${t.number}+added`);
}

export async function updateTask(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("tasks.edit");
  const before = await taskFor(db, user, str(fd, "id"));
  const path = `/tasks/${before.id}`;
  const title = str(fd, "title").slice(0, 200);
  if (!title) go(path, "err", "Give the task a title.");
  const dueAt = optDate(fd, "dueAt");
  const data: Prisma.TaskUncheckedUpdateInput = {
    title,
    description: str(fd, "description").slice(0, 5000),
    category: str(fd, "category").slice(0, 80),
    priority: priorityFrom(str(fd, "priority")),
    dueAt,
  };
  const notes: string[] = [];
  // A new deadline restarts escalation.
  if ((dueAt?.getTime() ?? null) !== (before.dueAt?.getTime() ?? null)) {
    notes.push(`Deadline: ${before.dueAt ? fmtDateTime(before.dueAt) : "none"} → ${dueAt ? fmtDateTime(dueAt) : "none"}`);
    if (before.escalatedAt && (!dueAt || dueAt > new Date())) Object.assign(data, { escalatedAt: null, escalatedToId: null });
  }
  const raw = str(fd, "assignedToId");
  if (fd.has("assignedToId") && raw !== (before.assignedToId ?? "")) {
    if (!can(user, "tasks.assign") && raw !== user.id) go(path, "err", "You can't give tasks to other people.");
    const who = raw
      ? await chooseAssignee(db, user, raw, { category: String(data.category), priority: data.priority as TaskPriority, customerId: before.customerId })
      : { assignedToId: null, assignedBy: user.name, note: `Unassigned by ${user.name}` };
    Object.assign(data, { assignedToId: who.assignedToId, assignedBy: who.assignedBy });
    notes.push(who.note);
  }
  await db.task.update({
    where: { id: before.id },
    data: { ...data, notes: notes.length ? { create: notes.map((text) => ({ text, system: true, userName: user.name })) } : undefined },
  });
  revalidatePath("/tasks");
  go(path, "msg", "Task saved");
}

export async function setTaskStatus(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("tasks.edit");
  const t = await taskFor(db, user, str(fd, "id"));
  const raw = str(fd, "status");
  if (!(raw in TaskStatus)) go(`/tasks/${t.id}`, "err", "Unknown status");
  const status = raw as TaskStatus;
  if (status !== t.status) {
    await db.task.update({
      where: { id: t.id },
      data: {
        status,
        completedAt: status === "DONE" ? new Date() : null,
        notes: { create: { text: `Status: ${TASK_STATUS_LABELS[t.status]} → ${TASK_STATUS_LABELS[status]}`, system: true, userName: user.name } },
      },
    });
  }
  revalidatePath("/tasks");
  const back = str(fd, "returnTo");
  if (back.startsWith("/") && !back.startsWith("//")) go(back, "msg", `${t.number}: ${TASK_STATUS_LABELS[status]}`);
  go(`/tasks/${t.id}`, "msg", `Marked ${TASK_STATUS_LABELS[status].toLowerCase()}`);
}

export async function addTaskNote(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("tasks.edit");
  const t = await taskFor(db, user, str(fd, "id"));
  const text = str(fd, "text").slice(0, 5000);
  if (text) await db.taskNote.create({ data: { taskId: t.id, text, userName: user.name } });
  go(`/tasks/${t.id}`, "msg", "Note added");
}

export async function deleteTask(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("tasks.delete");
  const t = await db.task.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/tasks");
  go("/tasks", "msg", `Task ${t.number} deleted`);
}

// ---------- Settings → Tasks ----------

export async function saveTaskSettings(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const hours = Math.round(Number(str(fd, "taskEscalateHours")));
  const toId = str(fd, "taskEscalateToId");
  const to = toId ? await db.user.findFirst({ where: { id: toId, disabled: false }, select: { id: true } }) : null;
  await db.settings.update({
    where: { id: 1 },
    data: {
      taskEscalateHours: Number.isFinite(hours) ? Math.min(24 * 60, Math.max(0, hours)) : 24,
      taskEscalateToId: to?.id ?? null,
      taskEscalateReassign: fd.get("taskEscalateReassign") === "on" && !!to,
      taskPrefix: str(fd, "taskPrefix").slice(0, 10) || "TSK-",
    },
  });
  go("/settings/tasks", "msg", "Task settings saved");
}

export async function saveAssignmentRule(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const id = str(fd, "id");
  const method = str(fd, "method") in AssignMethod ? (str(fd, "method") as AssignMethod) : AssignMethod.ROUND_ROBIN;
  const pool = str(fd, "pool");
  const validPool = isRole(pool) || (pool.startsWith(CUSTOM_ROLE_PREFIX) && !!(await db.customRole.findUnique({ where: { id: pool.slice(CUSTOM_ROLE_PREFIX.length) } })));
  const userId = str(fd, "userId");
  const user = userId ? await db.user.findFirst({ where: { id: userId, disabled: false }, select: { id: true } }) : null;
  const priority = str(fd, "priority");
  const data = {
    name: str(fd, "name").slice(0, 80),
    category: str(fd, "category").slice(0, 80),
    priority: priority in TaskPriority ? (priority as TaskPriority) : null,
    method,
    userId: method === "USER" ? user?.id ?? null : null,
    pool: validPool ? pool : "OFFICE",
    sameBranch: fd.get("sameBranch") === "on",
    active: id ? fd.get("active") === "on" : true,
    sortOrder: Math.round(Number(str(fd, "sortOrder"))) || 0,
  };
  if (!data.name) go("/settings/tasks", "err", "Give the rule a name.");
  if (method === "USER" && !data.userId) go("/settings/tasks", "err", "Choose the person for “Always this person”.");
  if (id) await db.assignmentRule.update({ where: { id }, data });
  else await db.assignmentRule.create({ data: { ...data, sortOrder: data.sortOrder || (await db.assignmentRule.count()) + 1 } });
  go("/settings/tasks", "msg", `Rule “${data.name}” saved`);
}

export async function deleteAssignmentRule(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const r = await db.assignmentRule.delete({ where: { id: str(fd, "id") } });
  go("/settings/tasks", "msg", `Rule “${r.name}” deleted`);
}

/** For the task page's quick "Assign to me". */
export async function takeTask(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("tasks.edit");
  const t = await taskFor(db, user, str(fd, "id"));
  if (t.assignedToId === user.id) go(`/tasks/${t.id}`, "msg", "It's already yours");
  if (t.assignedToId && !can(user, "tasks.assign")) go(`/tasks/${t.id}`, "err", "This task belongs to someone else.");
  await db.task.update({
    where: { id: t.id },
    data: { assignedToId: user.id, assignedBy: user.name, notes: { create: { text: `${user.name} took it over from ${await userName(db, t.assignedToId)}`, system: true, userName: user.name } } },
  });
  go(`/tasks/${t.id}`, "msg", "Assigned to you");
}
