"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { getSettings } from "@/lib/settings";
import {
  ACTIONS,
  RECIPES,
  blankAction,
  fieldsFor,
  parseActions,
  parseConditions,
  parseTriggerConfig,
  triggerDef,
  type WorkflowAction,
} from "@/lib/workflows/defs";
import { processDue, scanTimed } from "@/lib/workflows/engine";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const json = (fd: FormData, name: string): unknown => {
  try {
    return JSON.parse(str(fd, name) || "null");
  } catch {
    return null;
  }
};

/** A new workflow, switched off, from a recipe or blank. */
export async function createWorkflow(fd: FormData) {
  const user = await requirePermission("workflows.manage");
  const db = await tenantDb();
  const recipe = RECIPES.find((r) => r.key === str(fd, "recipe"));
  const wf = await db.workflow.create({
    data: recipe
      ? {
          name: recipe.name,
          description: recipe.description,
          trigger: recipe.trigger,
          triggerConfig: parseTriggerConfig(recipe.config ?? {}),
          conditions: parseConditions(recipe.conditions ?? []),
          waitMinutes: recipe.waitMinutes ?? 0,
          oncePer: recipe.oncePer ?? false,
          actions: parseActions(recipe.actions.map((a) => ({ ...blankAction(a.type ?? "task"), ...a }))),
          createdBy: user.name,
        }
      : { name: "New workflow", trigger: "customer.created", triggerConfig: parseTriggerConfig({}), actions: [blankAction("task")], createdBy: user.name },
  });
  revalidatePath("/workflows");
  go(`/workflows/${wf.id}`, "msg", "Workflow added, switched off. Check the steps, then switch it on and save.");
}

/** Problems that stop a workflow being saved, in plain words. */
function problems(trigger: string, actions: WorkflowAction[], conditionFields: string[]): string[] {
  const def = triggerDef(trigger);
  if (!def) return ["Choose what starts the workflow."];
  const out: string[] = [];
  const allowed = new Set(fieldsFor(def.subject).map(([k]) => k));
  if (conditionFields.some((f) => !allowed.has(f))) out.push("A condition doesn't apply to this trigger; remove it.");
  for (const a of actions) {
    const ad = ACTIONS[a.type];
    if (ad.subjects !== "all" && !(ad.subjects as string[]).includes(def.subject)) out.push(`“${ad.label}” doesn't work with this trigger.`);
    if (a.type === "email" && !a.from) out.push("Choose whose mailbox sends the email.");
    if (a.type === "email" && (!a.title || !a.body)) out.push("The email needs a subject and a message.");
    if ((a.type === "jobStatus" || a.type === "quoteStatus") && !a.status) out.push("Choose the status to change to.");
  }
  return out;
}

export async function saveWorkflow(fd: FormData) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  const id = str(fd, "id");
  const path = `/workflows/${id}`;
  const before = await db.workflow.findUnique({ where: { id } });
  if (!before) redirect("/workflows");
  const name = str(fd, "name").slice(0, 120);
  if (!name) go(path, "err", "Give the workflow a name.");
  const trigger = str(fd, "trigger");
  const triggerConfig = parseTriggerConfig(json(fd, "triggerConfig"));
  const conditions = parseConditions(json(fd, "conditions"));
  const actions = parseActions(json(fd, "actions"));
  const waitMinutes = Math.min(Math.max(0, Math.round(Number(str(fd, "waitMinutes")) || 0)), 365 * 1440);
  const active = fd.get("active") === "on";
  const issues = problems(trigger, actions, conditions.map((c) => c.field));
  if (active && actions.length === 0) issues.push("Add at least one thing for it to do.");
  const ok = issues.length === 0;
  // Always keep the edits; only switch it on when it is complete.
  const on = active && ok;
  await db.workflow.update({
    where: { id },
    data: {
      name,
      description: str(fd, "description").slice(0, 500),
      trigger: triggerDef(trigger) ? trigger : before.trigger,
      triggerConfig,
      conditions,
      waitMinutes,
      oncePer: fd.get("oncePer") === "on",
      actions,
      active: on,
      activeSince: on ? (before.active ? before.activeSince : new Date()) : before.activeSince,
    },
  });
  revalidatePath("/workflows");
  if (!ok) go(path, "err", `Saved${active ? ", but left switched off" : ""}: ${issues.join(" ")}`);
  go(path, "msg", on ? (before.active ? "Workflow saved." : "Workflow saved and switched on.") : "Workflow saved (switched off).");
}

export async function setWorkflowActive(fd: FormData) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  const id = str(fd, "id");
  const wf = await db.workflow.findUnique({ where: { id } });
  if (!wf) redirect("/workflows");
  const on = str(fd, "active") === "true";
  if (on) {
    const issues = problems(wf.trigger, parseActions(wf.actions), parseConditions(wf.conditions).map((c) => c.field));
    if (!parseActions(wf.actions).length) issues.push("Add at least one thing for it to do.");
    if (issues.length) go(`/workflows/${id}`, "err", `Not switched on: ${issues.join(" ")}`);
  }
  await db.workflow.update({ where: { id }, data: { active: on, ...(on && !wf.active ? { activeSince: new Date() } : {}) } });
  revalidatePath("/workflows");
  go(str(fd, "returnTo") || "/workflows", "msg", on ? `“${wf.name}” switched on.` : `“${wf.name}” switched off.`);
}

export async function deleteWorkflow(fd: FormData) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  const wf = await db.workflow.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/workflows");
  go("/workflows", "msg", `“${wf.name}” deleted.`);
}

/** Runs the daily checks now: timed workflows (all, or one) and waits that are due. */
export async function checkWorkflowsNow(fd: FormData) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  await getSettings();
  const id = str(fd, "id") || undefined;
  const started = await scanTimed(db, new Date(), id);
  const finished = await processDue(db, new Date(), 50);
  revalidatePath("/workflows");
  const n = started + finished;
  go(id ? `/workflows/${id}` : "/workflows", "msg", n ? `Checked: ${started} started, ${finished} finished waiting.` : "Checked: nothing to do right now.");
}

export async function cancelWorkflowRun(fd: FormData) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  const run = await db.workflowRun.findUnique({ where: { id: str(fd, "id") } });
  if (!run) redirect("/workflows");
  await db.workflowRun.updateMany({
    where: { id: run.id, status: "WAITING" },
    data: { status: "CANCELLED", finishedAt: new Date(), log: [{ action: "Cancelled", ok: true, message: "Cancelled by hand while waiting." }] },
  });
  revalidatePath(`/workflows/${run.workflowId}`);
  go(`/workflows/${run.workflowId}`, "msg", "Cancelled.");
}
