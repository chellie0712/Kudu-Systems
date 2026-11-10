// Tasks: work for one person with a deadline. New tasks nobody was chosen for are handed out by
// the assignment rules (Settings → Tasks); open tasks past their deadline are escalated.
import type { AssignmentRule, Prisma, PrismaClient, Settings, TaskPriority, TaskStatus } from "@prisma/client";
import { can, CUSTOM_ROLE_PREFIX, ROLE_LABELS, isRole, type Role } from "./permissions";

type Tx = PrismaClient | Prisma.TransactionClient;
const HOUR = 3600000;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { OPEN: "To do", IN_PROGRESS: "In progress", DONE: "Done", CANCELLED: "Cancelled" };
export const TASK_STATUS_COLOURS: Record<TaskStatus, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  DONE: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-charcoal-100 text-charcoal-500 line-through",
};
export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
export const TASK_PRIORITY_COLOURS: Record<TaskPriority, string> = {
  LOW: "text-charcoal-500",
  NORMAL: "text-charcoal-700",
  HIGH: "font-semibold text-amber-700",
  URGENT: "font-bold text-kudu-700",
};
export const TASK_CATEGORIES = ["Follow-up call", "Send quotation", "Book job", "Order parts", "Chase payment", "Site visit", "Admin"];
export const OPEN_TASK: TaskStatus[] = ["OPEN", "IN_PROGRESS"];
export const isOpenTask = (s: TaskStatus) => OPEN_TASK.includes(s);
export const isTaskOverdue = (t: { status: TaskStatus; dueAt: Date | null }, now = new Date()) => isOpenTask(t.status) && !!t.dueAt && t.dueAt < now;

export const METHOD_LABELS = { USER: "Always this person", ROUND_ROBIN: "Take turns", LEAST_BUSY: "Fewest open tasks" } as const;

type Who = { id: string; role: Role; permissions?: readonly string[] | null };

/** The tasks a user may see: everyone's with "See everyone's tasks", else their own and the ones they created. */
export function taskScope(user: Who): Prisma.TaskWhereInput {
  if (can(user, "tasks.viewAll")) return {};
  return { OR: [{ assignedToId: user.id }, { createdById: user.id }, { escalatedToId: user.id }] };
}

export function canSeeTask(user: Who, t: { assignedToId: string | null; createdById: string | null; escalatedToId: string | null }) {
  return can(user, "tasks.viewAll") || t.assignedToId === user.id || t.createdById === user.id || t.escalatedToId === user.id;
}

/** A rule's pool as text, e.g. "Office" or the custom role's name. */
export function poolLabel(pool: string, customRoles: { id: string; name: string }[]): string {
  if (pool.startsWith(CUSTOM_ROLE_PREFIX)) return customRoles.find((r) => `${CUSTOM_ROLE_PREFIX}${r.id}` === pool)?.name ?? "a deleted role";
  return isRole(pool) ? ROLE_LABELS[pool] : pool;
}

/** Active people in a rule's pool, optionally only those whose home branch is `branchId`. */
async function poolMembers(db: Tx, rule: AssignmentRule, branchId: string | null) {
  const byRole: Prisma.UserWhereInput = rule.pool.startsWith(CUSTOM_ROLE_PREFIX)
    ? { customRoleId: rule.pool.slice(CUSTOM_ROLE_PREFIX.length) }
    : { role: isRole(rule.pool) ? rule.pool : "OFFICE", customRoleId: null };
  return db.user.findMany({
    where: { disabled: false, ...byRole, ...(rule.sameBranch && branchId ? { branchId } : {}) },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
}

/**
 * Picks who gets a new task from the first active rule that matches its type and priority.
 * Returns null when no rule matches or the rule's pool is empty.
 */
export async function autoAssign(
  db: Tx,
  task: { category: string; priority: TaskPriority; customerId?: string | null },
): Promise<{ userId: string; userName: string; ruleName: string } | null> {
  const rules = await db.assignmentRule.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const rule = rules.find(
    (r) => (!r.category || r.category.toLowerCase() === task.category.trim().toLowerCase()) && (!r.priority || r.priority === task.priority),
  );
  if (!rule) return null;
  if (rule.method === "USER") {
    const u = rule.userId ? await db.user.findFirst({ where: { id: rule.userId, disabled: false }, select: { id: true, name: true, email: true } }) : null;
    return u ? { userId: u.id, userName: u.name || u.email || "", ruleName: rule.name } : null;
  }
  const branchId = task.customerId ? (await db.customer.findUnique({ where: { id: task.customerId }, select: { branchId: true } }))?.branchId ?? null : null;
  const members = await poolMembers(db, rule, branchId);
  if (!members.length) return null;
  let pick = members[0];
  if (rule.method === "ROUND_ROBIN") {
    const i = members.findIndex((m) => m.id === rule.lastAssignedId);
    pick = members[(i + 1) % members.length];
    await db.assignmentRule.update({ where: { id: rule.id }, data: { lastAssignedId: pick.id } });
  } else {
    const counts = await db.task.groupBy({ by: ["assignedToId"], where: { status: { in: OPEN_TASK }, assignedToId: { in: members.map((m) => m.id) } }, _count: true });
    const load = (id: string) => counts.find((c) => c.assignedToId === id)?._count ?? 0;
    pick = [...members].sort((a, b) => load(a.id) - load(b.id))[0];
  }
  return { userId: pick.id, userName: pick.name || pick.email || "", ruleName: rule.name };
}

/**
 * Escalates open tasks that are more than `taskEscalateHours` past their deadline and not yet
 * escalated: marks them, notes it on the task and, if set, hands them to the escalation person.
 * Cheap when nothing is due, so pages call it on load as well as the daily cron.
 */
export async function escalateOverdue(db: PrismaClient, settings: Settings, now = new Date()): Promise<number> {
  if (settings.taskEscalateHours <= 0) return 0;
  const due = await db.task.findMany({
    where: { status: { in: OPEN_TASK }, escalatedAt: null, dueAt: { lt: new Date(now.getTime() - settings.taskEscalateHours * HOUR) } },
    select: { id: true, assignedToId: true, assignedTo: { select: { name: true, email: true } } },
    take: 200,
  });
  if (!due.length) return 0;
  const target = settings.taskEscalateToId
    ? await db.user.findFirst({ where: { id: settings.taskEscalateToId, disabled: false }, select: { id: true, name: true, email: true } })
    : null;
  const targetName = target ? target.name || target.email : "the managers";
  for (const t of due) {
    const reassign = settings.taskEscalateReassign && target && t.assignedToId !== target.id;
    // Only the first caller escalates a task, even if two pages load at once.
    const done = await db.task.updateMany({
      where: { id: t.id, escalatedAt: null },
      data: { escalatedAt: now, escalatedToId: target?.id ?? null, ...(reassign ? { assignedToId: target!.id, assignedBy: "Escalation" } : {}) },
    });
    if (!done.count) continue;
    const was = t.assignedTo ? t.assignedTo.name || t.assignedTo.email : "nobody";
    await db.taskNote.create({
      data: {
        taskId: t.id,
        system: true,
        userName: "Kudu",
        text: `Overdue by more than ${settings.taskEscalateHours} h: escalated to ${targetName}${reassign ? ` and reassigned from ${was}` : ""}.`,
      },
    });
  }
  return due.length;
}

/** Counts for the menu badge and dashboard: my open tasks, my overdue ones, and escalations waiting on me. */
export async function myTaskCounts(db: PrismaClient, user: Who, now = new Date()) {
  const mine = { assignedToId: user.id, status: { in: OPEN_TASK } };
  const [open, overdue, escalated] = await Promise.all([
    db.task.count({ where: mine }),
    db.task.count({ where: { ...mine, dueAt: { lt: now } } }),
    db.task.count({
      where: {
        status: { in: OPEN_TASK },
        escalatedAt: { not: null },
        OR: [{ escalatedToId: user.id }, ...(can(user, "tasks.viewAll") ? [{ escalatedToId: null }] : [])],
      },
    }),
  ]);
  return { open, overdue, escalated };
}

/** What a task table row needs alongside the task. */
export const TASK_ROW_INCLUDE = {
  assignedTo: { select: { name: true, email: true } },
  customer: { select: { id: true, name: true } },
  jobCard: { select: { id: true, number: true } },
  quotation: { select: { id: true, number: true } },
  invoice: { select: { id: true, number: true } },
  query: { select: { id: true, number: true } },
} satisfies Prisma.TaskInclude;

/** Open first, then by deadline (none last), urgent before low, newest first. */
export const TASK_ORDER: Prisma.TaskOrderByWithRelationInput[] = [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { createdAt: "desc" }];
