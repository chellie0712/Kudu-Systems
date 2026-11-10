import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { TASK_CATEGORIES } from "@/lib/tasks";
import { QUERY_CATEGORIES } from "@/lib/queries";
import { parseActions, parseConditions, parseTriggerConfig, triggerDef } from "@/lib/workflows/defs";
import { builderLists } from "@/lib/workflows/lists";
import { checkWorkflowsNow, deleteWorkflow, saveWorkflow } from "@/app/actions/workflows";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { WorkflowBuilder } from "@/components/WorkflowBuilder";
import { RunList } from "@/components/WorkflowRuns";

export const metadata = { title: "Workflow" };

export default async function WorkflowPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string; runs?: string }> }) {
  await requirePermission("workflows.manage");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err, runs: show } = await searchParams;
  const wf = await db.workflow.findUnique({ where: { id } });
  if (!wf) notFound();
  const showSkipped = show === "all";
  const [lists, runs, skipped] = await Promise.all([
    builderLists(db),
    db.workflowRun.findMany({ where: { workflowId: id, ...(showSkipped ? {} : { status: { not: "SKIPPED" } }) }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.workflowRun.count({ where: { workflowId: id, status: "SKIPPED" } }),
  ]);
  const timed = triggerDef(wf.trigger)?.timed;

  return (
    <div className="max-w-3xl">
      <PageHeader back={{ href: "/workflows", label: "Workflows" }} title={wf.name} subtitle={wf.description} />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <form action={saveWorkflow} className="space-y-4">
        <input type="hidden" name="id" value={wf.id} />
        <div className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *"><input name="name" required defaultValue={wf.name} className="input" /></Field>
            <Field label="Notes (for your team)"><input name="description" defaultValue={wf.description} className="input" /></Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={wf.active} className="mt-0.5" />
            <span>
              <span className="font-semibold">Switched on</span>
              <span className="block text-xs text-charcoal-500">When off, nothing happens. Anything waiting is cancelled when its time comes.</span>
            </span>
          </label>
        </div>
        <WorkflowBuilder
          initial={{ trigger: wf.trigger, config: parseTriggerConfig(wf.triggerConfig), conditions: parseConditions(wf.conditions), waitMinutes: wf.waitMinutes, oncePer: wf.oncePer, actions: parseActions(wf.actions) }}
          lists={lists}
          taskCategories={[...TASK_CATEGORIES]}
          queryCategories={[...QUERY_CATEGORIES]}
        />
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary">Save workflow</button>
          <span className="text-xs text-charcoal-500">Workflows act for the whole company. Test a new one on a test customer first.</span>
        </div>
      </form>

      <div className="mt-8 mb-2 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>What it did</SectionTitle>
        <div className="flex gap-2">
          {timed && wf.active && (
            <form action={checkWorkflowsNow}>
              <input type="hidden" name="id" value={wf.id} />
              <button className="btn-outline py-1 text-xs">Check now</button>
            </form>
          )}
          {skipped > 0 && (
            <a href={showSkipped ? `/workflows/${wf.id}` : `/workflows/${wf.id}?runs=all`} className="btn-outline py-1 text-xs">
              {showSkipped ? "Hide" : "Show"} {skipped} not needed
            </a>
          )}
        </div>
      </div>
      <div className="card mb-8">
        <RunList runs={runs} />
      </div>

      <form action={deleteWorkflow} className="text-right">
        <input type="hidden" name="id" value={wf.id} />
        <ConfirmButton message={`Delete “${wf.name}” and its history?`} className="text-sm text-kudu-600 hover:underline">Delete workflow</ConfirmButton>
      </form>
    </div>
  );
}
