import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { ACTIONS, RECIPES, TRIGGERS, describeTrigger, fmtWait, parseActions, parseConditions, parseTriggerConfig } from "@/lib/workflows/defs";
import { builderLists } from "@/lib/workflows/lists";
import { checkWorkflowsNow, createWorkflow, setWorkflowActive } from "@/app/actions/workflows";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { RunStatus } from "@/components/WorkflowRuns";

export const metadata = { title: "Workflows" };

export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  const { msg, err } = await searchParams;
  const [flows, recent, lists, waiting] = await Promise.all([
    db.workflow.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
    db.workflowRun.findMany({ where: { status: { not: "SKIPPED" } }, include: { workflow: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 15 }),
    builderLists(db),
    db.workflowRun.groupBy({ by: ["workflowId"], where: { status: "WAITING" }, _count: true }),
  ]);
  const used = new Set(flows.map((f) => f.name));

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Workflows"
        subtitle="Let Kudu do the routine steps: when something happens, if it matches, it creates tasks, changes statuses, makes job cards and invoices, or sends an email."
        actions={
          <form action={checkWorkflowsNow}>
            <button className="btn-outline" title="Runs the daily checks (overdue, upcoming, no reply…) and finishes waits that are due">Check now</button>
          </form>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="card mb-6 overflow-x-auto">
        {flows.length === 0 ? (
          <Empty>No workflows yet. Start from one of the recipes below.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th>What it does</th>
                <th className="text-right">Runs</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {flows.map((f) => {
                const conds = parseConditions(f.conditions).length;
                const acts = parseActions(f.actions);
                const w = waiting.find((x) => x.workflowId === f.id)?._count ?? 0;
                return (
                  <tr key={f.id} className={f.active ? "" : "opacity-70"}>
                    <td>
                      <Link href={`/workflows/${f.id}`} className="font-semibold text-kudu-700 hover:underline">{f.name}</Link>
                      <div className={`text-xs font-semibold ${f.active ? "text-emerald-700" : "text-charcoal-500"}`}>{f.active ? "On" : "Off"}</div>
                    </td>
                    <td className="text-sm">
                      <div>
                        <span className="font-medium">When</span> {describeTrigger(f.trigger, parseTriggerConfig(f.triggerConfig), lists).replace(/^./, (c) => c.toLowerCase())}
                        {conds > 0 && <span className="text-charcoal-500"> · if {conds} condition{conds === 1 ? "" : "s"}</span>}
                        {f.waitMinutes > 0 && <span className="text-charcoal-500"> · wait {fmtWait(f.waitMinutes)}</span>}
                      </div>
                      <div className="text-xs text-charcoal-500">Then: {acts.map((a) => ACTIONS[a.type].label.toLowerCase()).join(", ") || "nothing yet"}</div>
                    </td>
                    <td className="text-right text-sm whitespace-nowrap">
                      {f.runCount}
                      {w > 0 && <div className="text-xs text-amber-700">{w} waiting</div>}
                      {f.lastRunAt && <div className="text-xs text-charcoal-500">{fmtDateTime(f.lastRunAt)}</div>}
                    </td>
                    <td className="text-right">
                      <form action={setWorkflowActive}>
                        <input type="hidden" name="id" value={f.id} />
                        <input type="hidden" name="active" value={f.active ? "false" : "true"} />
                        <button className={`${f.active ? "btn-outline" : "btn-primary"} py-1 text-xs`}>{f.active ? "Switch off" : "Switch on"}</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mb-6 p-5">
        <SectionTitle>Start from a recipe</SectionTitle>
        <p className="mb-4 text-sm text-charcoal-600">Each recipe is added switched off, so you can check it and change anything before it starts working.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {RECIPES.map((r) => (
            <form key={r.key} action={createWorkflow} className="flex flex-col rounded-md border border-charcoal-200 p-4">
              <input type="hidden" name="recipe" value={r.key} />
              <div className="font-semibold">{r.name}</div>
              <p className="mt-1 flex-1 text-sm text-charcoal-600">{r.description}</p>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-charcoal-500">{TRIGGERS[r.trigger].group}</span>
                <button className="btn-outline py-1 text-xs">{used.has(r.name) ? "Add another" : "Use this"}</button>
              </div>
            </form>
          ))}
          <form action={createWorkflow} className="flex flex-col justify-between rounded-md border border-dashed border-charcoal-300 p-4">
            <div>
              <div className="font-semibold">Build your own</div>
              <p className="mt-1 text-sm text-charcoal-600">Choose what starts it, add conditions, and pick the steps.</p>
            </div>
            <button className="btn-primary mt-3 self-start py-1 text-xs">Start from scratch</button>
          </form>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="card p-5">
          <SectionTitle>Recent activity</SectionTitle>
          <ul className="divide-y divide-charcoal-100 text-sm">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <span>
                  <RunStatus status={r.status} />{" "}
                  <Link href={`/workflows/${r.workflowId}`} className="font-medium text-kudu-700 hover:underline">{r.workflow.name}</Link>
                  {r.label && <> · {r.link ? <Link href={r.link} className="hover:underline">{r.label}</Link> : r.label}</>}
                </span>
                <span className="text-xs text-charcoal-500">{fmtDateTime(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
