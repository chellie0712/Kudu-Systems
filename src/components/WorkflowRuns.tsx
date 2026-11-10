import Link from "next/link";
import type { WorkflowRun, WorkflowRunStatus } from "@prisma/client";
import { fmtDateTime } from "@/lib/format";
import { cancelWorkflowRun } from "@/app/actions/workflows";
import type { LogEntry } from "@/lib/workflows/engine";
import { Empty } from "./ui";

const LABELS: Record<WorkflowRunStatus, [string, string]> = {
  WAITING: ["Waiting", "bg-amber-100 text-amber-800"],
  RUNNING: ["Running", "bg-sky-100 text-sky-800"],
  DONE: ["Done", "bg-emerald-100 text-emerald-800"],
  FAILED: ["Failed", "bg-kudu-600 text-white"],
  SKIPPED: ["Not needed", "bg-charcoal-100 text-charcoal-600"],
  CANCELLED: ["Cancelled", "bg-charcoal-100 text-charcoal-500"],
};

export function RunStatus({ status }: { status: WorkflowRunStatus }) {
  const [label, cls] = LABELS[status];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

/** A workflow's history: what started it and what each step did. */
export function RunList({ runs }: { runs: WorkflowRun[] }) {
  if (!runs.length) return <Empty>It hasn&apos;t run yet.</Empty>;
  return (
    <ul className="divide-y divide-charcoal-100">
      {runs.map((r) => {
        const log = (Array.isArray(r.log) ? r.log : []) as LogEntry[];
        return (
          <li key={r.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                <RunStatus status={r.status} /> {r.link ? <Link href={r.link} className="font-medium text-kudu-700 hover:underline">{r.label}</Link> : r.label}
                {r.depth > 0 && <span className="ml-1 text-xs text-charcoal-500">(started by another workflow)</span>}
              </span>
              <span className="text-xs text-charcoal-500">
                {fmtDateTime(r.createdAt)}
                {r.status === "WAITING" && r.runAt && <> · due {fmtDateTime(r.runAt)}</>}
              </span>
            </div>
            {log.length > 0 && (
              <ul className="mt-1 space-y-0.5 text-xs">
                {log.map((l, i) => (
                  <li key={i} className={l.ok ? "text-charcoal-600" : "text-kudu-700"}>
                    {l.ok ? "✓" : "✗"} {l.action}: {l.link ? <Link href={l.link} className="underline">{l.message}</Link> : l.message}
                  </li>
                ))}
              </ul>
            )}
            {r.status === "WAITING" && (
              <form action={cancelWorkflowRun} className="mt-1">
                <input type="hidden" name="id" value={r.id} />
                <button className="text-xs text-kudu-600 hover:underline">Cancel this one</button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
