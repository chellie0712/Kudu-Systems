import Link from "next/link";
import type { AssignmentRule, TaskPriority } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { CUSTOM_ROLE_PREFIX, ROLE_LABELS, ROLES } from "@/lib/permissions";
import { METHOD_LABELS, poolLabel, TASK_CATEGORIES, TASK_PRIORITY_LABELS } from "@/lib/tasks";
import { deleteAssignmentRule, saveAssignmentRule, saveTaskSettings } from "@/app/actions/tasks";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Task settings" };

type Person = { id: string; name: string };

function RuleForm({ rule, people, pools }: { rule?: AssignmentRule; people: Person[]; pools: { value: string; label: string }[] }) {
  return (
    <form action={saveAssignmentRule} className="grid gap-3 sm:grid-cols-6">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <label className="block sm:col-span-3">
        <span className="label">Rule name *</span>
        <input name="name" required maxLength={80} defaultValue={rule?.name} className="input" placeholder="e.g. Payment follow-ups to accounts" />
      </label>
      <label className="block sm:col-span-2">
        <span className="label">For tasks of type</span>
        <input name="category" list="rule-categories" defaultValue={rule?.category} className="input" placeholder="Any type" />
      </label>
      <label className="block sm:col-span-1">
        <span className="label">Priority</span>
        <select name="priority" defaultValue={rule?.priority ?? ""} className="input">
          <option value="">Any</option>
          {(Object.keys(TASK_PRIORITY_LABELS) as TaskPriority[]).map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Give it to</span>
        <select name="method" defaultValue={rule?.method ?? "ROUND_ROBIN"} className="input">
          {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">Person (for “Always this person”)</span>
        <select name="userId" defaultValue={rule?.userId ?? ""} className="input">
          <option value="">Choose…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className="label">From the role (other methods)</span>
        <select name="pool" defaultValue={rule?.pool ?? "OFFICE"} className="input">
          {pools.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-3">
        <input type="checkbox" name="sameBranch" defaultChecked={rule?.sameBranch ?? false} />
        Only people from the customer&apos;s branch
      </label>
      <label className="block sm:col-span-1">
        <span className="label">Order</span>
        <input name="sortOrder" type="number" defaultValue={rule?.sortOrder} className="input" />
      </label>
      {rule && (
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="active" defaultChecked={rule.active} />
          Active
        </label>
      )}
      <div className="sm:col-span-6">
        <button className="btn-primary">{rule ? "Save rule" : "Add rule"}</button>
      </div>
    </form>
  );
}

export default async function TaskSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; edit?: string }> }) {
  await requirePermission("settings.manage");
  const db = await tenantDb();
  const { msg, err, edit } = await searchParams;
  const [s, rules, users, customRoles] = await Promise.all([
    getSettings(),
    db.assignmentRule.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], include: { user: { select: { name: true, email: true } } } }),
    db.user.findMany({ where: { disabled: false }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    db.customRole.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const people = users.map((u) => ({ id: u.id, name: u.name || u.email || "Unnamed user" }));
  const pools = [
    ...ROLES.map((r) => ({ value: r as string, label: ROLE_LABELS[r] })),
    ...customRoles.map((r) => ({ value: `${CUSTOM_ROLE_PREFIX}${r.id}`, label: r.name })),
  ];
  const editing = edit ? rules.find((r) => r.id === edit) : undefined;

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/settings#tasks", label: "Settings" }}
        title="Tasks: assignment & escalation"
        subtitle="When someone adds a task with “Assign to: Automatically”, the first active rule that matches its type and priority picks the person."
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <datalist id="rule-categories">{TASK_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>

      <div className="card mb-6 p-6">
        <SectionTitle>Assignment rules</SectionTitle>
        {rules.length === 0 ? (
          <Empty>No rules yet, so new tasks go to whoever adds them unless they choose someone.</Empty>
        ) : (
          <ol className="mb-6 divide-y divide-charcoal-100 rounded-md border border-charcoal-100">
            {rules.map((r, i) => (
              <li key={r.id} className={`p-3 text-sm ${r.active ? "" : "opacity-60"}`}>
                {editing?.id === r.id ? (
                  <>
                    <RuleForm rule={r} people={people} pools={pools} />
                    <Link href="/settings/tasks" className="mt-2 inline-block text-sm text-charcoal-500 hover:text-kudu-600">Cancel</Link>
                  </>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {i + 1}. {r.name} {!r.active && <span className="text-xs font-normal text-charcoal-500">(off)</span>}
                      </div>
                      <div className="text-charcoal-600">
                        {r.category ? `“${r.category}” tasks` : "Any type"}
                        {r.priority ? `, ${TASK_PRIORITY_LABELS[r.priority].toLowerCase()} priority` : ""} →{" "}
                        {r.method === "USER"
                          ? r.user ? r.user.name || r.user.email : "a removed user"
                          : `${METHOD_LABELS[r.method].toLowerCase()} among ${poolLabel(r.pool, customRoles)}${r.sameBranch ? " in the customer’s branch" : ""}`}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link href={`/settings/tasks?edit=${r.id}`} className="btn-outline py-1 text-xs">Edit</Link>
                      <form action={deleteAssignmentRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton message={`Delete the rule “${r.name}”?`} className="btn-outline py-1 text-xs text-kudu-700">Delete</ConfirmButton>
                      </form>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}
        {!editing && (
          <div className="mt-4 rounded-md bg-charcoal-50 p-4">
            <div className="mb-3 text-sm font-semibold">Add a rule</div>
            <RuleForm people={people} pools={pools} />
          </div>
        )}
        <p className="mt-3 text-xs text-charcoal-500">
          “Take turns” goes round the people in the role in name order. “Fewest open tasks” picks whoever has the fewest tasks still to do. Disabled users are skipped.
          If nobody is available, the task is left unassigned and shows under Tasks → Nobody assigned.
        </p>
      </div>

      <div className="card p-6">
        <SectionTitle>Escalation</SectionTitle>
        <form action={saveTaskSettings} className="grid gap-3 sm:grid-cols-6">
          <label className="block sm:col-span-2">
            <span className="label">Escalate when overdue by (hours)</span>
            <input name="taskEscalateHours" type="number" min={0} max={1440} defaultValue={s.taskEscalateHours} className="input" />
            <span className="text-xs text-charcoal-500">0 turns escalation off.</span>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Escalate to</span>
            <select name="taskEscalateToId" defaultValue={s.taskEscalateToId ?? ""} className="input">
              <option value="">All managers (everyone who sees all tasks)</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="label">Task number prefix</span>
            <input name="taskPrefix" defaultValue={s.taskPrefix} maxLength={10} className="input" />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-6">
            <input type="checkbox" name="taskEscalateReassign" defaultChecked={s.taskEscalateReassign} />
            Also hand the task over to that person (only when one person is chosen above)
          </label>
          <div className="sm:col-span-6">
            <button className="btn-primary">Save escalation settings</button>
          </div>
        </form>
        <p className="mt-3 text-xs text-charcoal-500">
          Escalated tasks get a red “Escalated” label, a note on the task, and show on the dashboard and under Tasks → Escalated for the person they were escalated to.
          Kudu checks whenever someone opens Tasks or the dashboard, and once a day overnight. Giving a task a new deadline in the future clears the escalation.
        </p>
      </div>
    </div>
  );
}
