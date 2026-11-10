"use client";

import { useMemo, useState } from "react";
import {
  ACTIONS,
  ASSIGN_TO,
  EMAIL_TO,
  FIELDS,
  INVOICE_STATUSES,
  OPS,
  PLACEHOLDERS,
  QUERY_STATUSES,
  QUOTE_STATUSES,
  SUBJECT_LABELS,
  TRIGGERS,
  TRIGGER_KEYS,
  actionsFor,
  blankAction,
  fieldsFor,
  opsFor,
  triggerDef,
  type ActionType,
  type BuilderLists,
  type Condition,
  type TriggerConfig,
  type WorkflowAction,
} from "@/lib/workflows/defs";

type Props = {
  initial: { trigger: string; config: TriggerConfig; conditions: Condition[]; waitMinutes: number; oncePer: boolean; actions: WorkflowAction[] };
  lists: BuilderLists;
  taskCategories: string[];
  queryCategories: string[];
};

const PRIORITIES = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };

function Select({ value, onChange, options, label, className = "" }: { value: string; onChange: (v: string) => void; options: Record<string, string>; label: string; className?: string }) {
  return (
    <select aria-label={label} className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {Object.entries(options).map(([k, v]) => (
        <option key={k} value={k}>{v}</option>
      ))}
    </select>
  );
}

function Step({ word, title, children }: { word: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-3 flex items-baseline gap-3">
        <span className="rounded-md bg-charcoal-800 px-2 py-0.5 text-xs font-bold tracking-wide text-white uppercase">{word}</span>
        <h2 className="text-sm font-semibold text-charcoal-700">{title}</h2>
      </div>
      {children}
    </section>
  );
}

/**
 * The no-code workflow builder: When (trigger) → Only if (conditions) → Wait → Then (actions).
 * Everything is sent as hidden inputs with the surrounding form.
 */
export function WorkflowBuilder({ initial, lists, taskCategories, queryCategories }: Props) {
  const [trigger, setTrigger] = useState(initial.trigger);
  const [config, setConfig] = useState<TriggerConfig>(initial.config);
  const [conditions, setConditions] = useState<Condition[]>(initial.conditions);
  const [wait, setWait] = useState(() => {
    const m = initial.waitMinutes;
    return m && m % 1440 === 0 ? { n: m / 1440, unit: 1440 } : m && m % 60 === 0 ? { n: m / 60, unit: 60 } : { n: m, unit: m ? 1 : 1440 };
  });
  const [actions, setActions] = useState<WorkflowAction[]>(initial.actions);

  const def = triggerDef(trigger)!;
  const subject = def.subject;
  const fields = useMemo(() => fieldsFor(subject), [subject]);
  const allowedActions = useMemo(() => actionsFor(subject), [subject]);

  const changeTrigger = (t: string) => {
    const next = triggerDef(t)!;
    setTrigger(t);
    setConfig((c) => ({ ...c, status: "", formId: "" }));
    if (next.subject !== subject) {
      const ok = new Set(fieldsFor(next.subject).map(([k]) => k));
      setConditions((cs) => cs.filter((c) => ok.has(c.field)));
      const okActions = new Set(actionsFor(next.subject).map(([k]) => k));
      setActions((as) => as.filter((a) => okActions.has(a.type)));
    }
  };

  const statusOptions: Record<string, string> | null =
    def.option === "quoteStatus" ? QUOTE_STATUSES : def.option === "invoiceStatus" ? INVOICE_STATUSES : def.option === "queryStatus" ? QUERY_STATUSES : def.option === "jobStatus" ? lists.jobStatuses : null;

  const optionsFor = (field: string): Record<string, string> | null => {
    const o = FIELDS[field]?.options;
    if (!o) return null;
    return typeof o === "string" ? (lists[o.slice(8) as keyof BuilderLists] as Record<string, string>) : o;
  };

  const setCond = (i: number, patch: Partial<Condition>) => setConditions((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setAct = (i: number, patch: Partial<WorkflowAction>) => setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const moveAct = (i: number, to: number) =>
    setActions((as) => {
      if (to < 0 || to >= as.length) return as;
      const next = [...as];
      const [a] = next.splice(i, 1);
      next.splice(to, 0, a);
      return next;
    });

  const users = Object.fromEntries(Object.entries(lists.users).map(([k, v]) => [`user:${k}`, v]));
  const assignOptions: Record<string, string> = {
    rules: ASSIGN_TO.rules,
    ...(subject === "job" ? { technician: ASSIGN_TO.technician } : {}),
    ...(subject === "query" ? { owner: ASSIGN_TO.owner } : {}),
    nobody: ASSIGN_TO.nobody,
    ...users,
  };
  const emailTo: Record<string, string> = { customer: EMAIL_TO.customer, ...(subject === "job" ? { technician: EMAIL_TO.technician } : {}), ...users };
  const groups = [...new Set(TRIGGER_KEYS.map((k) => TRIGGERS[k].group))];

  return (
    <div className="space-y-4">
      <input type="hidden" name="trigger" value={trigger} />
      <input type="hidden" name="triggerConfig" value={JSON.stringify(config)} />
      <input type="hidden" name="conditions" value={JSON.stringify(conditions)} />
      <input type="hidden" name="waitMinutes" value={String(wait.n * wait.unit)} />
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />

      <Step word="When" title="What starts it">
        <select aria-label="Trigger" className="input" value={trigger} onChange={(e) => changeTrigger(e.target.value)}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {TRIGGER_KEYS.filter((k) => TRIGGERS[k].group === g).map((k) => (
                <option key={k} value={k}>{TRIGGERS[k].label}{"timed" in TRIGGERS[k] ? " (checked daily)" : ""}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {statusOptions && (
            <>
              <span>to</span>
              <Select label="Status" className="w-auto" value={config.status} onChange={(status) => setConfig({ ...config, status })} options={{ "": "any status", ...statusOptions }} />
            </>
          )}
          {def.option === "form" && (
            <>
              <span>Form:</span>
              <Select label="Form" className="w-auto" value={config.formId} onChange={(formId) => setConfig({ ...config, formId })} options={{ "": "any form", ...lists.forms }} />
            </>
          )}
          {(def.option === "daysAfter" || def.option === "daysBefore") && (
            <>
              <input
                aria-label="Days"
                type="number"
                min={def.option === "daysBefore" ? 1 : 0}
                max={3650}
                className="input w-24"
                value={config.days}
                onChange={(e) => setConfig({ ...config, days: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
              <span>days {def.option === "daysBefore" ? "before" : "after"}</span>
            </>
          )}
        </div>
        {def.help && <p className="mt-2 text-xs text-charcoal-500">{def.help}</p>}
        {!def.timed && (
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input type="checkbox" name="oncePer" defaultChecked={initial.oncePer} />
            Only once for each {SUBJECT_LABELS[subject]}
            <span className="text-xs text-charcoal-500">(e.g. reopening and completing a job again does nothing)</span>
          </label>
        )}
        {def.timed && (
          <p className="mt-1 text-xs text-charcoal-500">
            Checked every morning. Only {SUBJECT_LABELS[subject]}s that reach this point after the workflow is switched on are picked up, so switching it on does not act on old records.
          </p>
        )}
      </Step>

      <Step word="Only if" title={conditions.length ? "All of these must be true" : "Always (no conditions)"}>
        <div className="space-y-2">
          {conditions.map((c, i) => {
            const f = FIELDS[c.field];
            const opts = optionsFor(c.field);
            const noValue = c.op === "empty" || c.op === "notEmpty";
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Select
                  label="Field"
                  className="w-full sm:w-auto sm:flex-1"
                  value={c.field}
                  onChange={(field) => setCond(i, { field, op: opsFor(FIELDS[field].kind)[0], value: "" })}
                  options={Object.fromEntries(fields.map(([k, d]) => [k, d.label]))}
                />
                <Select label="Comparison" className="w-auto" value={c.op} onChange={(op) => setCond(i, { op: op as Condition["op"] })} options={Object.fromEntries(opsFor(f.kind).map((o) => [o, OPS[o]]))} />
                {!noValue &&
                  (opts ? (
                    <Select label="Value" className="w-auto" value={c.value} onChange={(value) => setCond(i, { value })} options={{ "": "Choose…", ...opts }} />
                  ) : (
                    <input
                      aria-label="Value"
                      className="input w-full sm:w-40"
                      inputMode={f.kind === "text" ? "text" : "decimal"}
                      placeholder={f.kind === "money" ? "Rands, e.g. 5000" : ""}
                      value={c.value}
                      onChange={(e) => setCond(i, { value: e.target.value })}
                    />
                  ))}
                <button type="button" className="px-2 text-charcoal-400 hover:text-kudu-600" aria-label="Remove condition" onClick={() => setConditions((cs) => cs.filter((_, j) => j !== i))}>✕</button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className="btn-outline mt-3 py-1 text-xs"
          onClick={() => setConditions((cs) => [...cs, { field: fields[0][0], op: opsFor(fields[0][1].kind)[0], value: "" }])}
        >
          + Condition
        </button>
      </Step>

      <Step word="Wait" title={wait.n ? "Then wait before acting" : "Act straight away"}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <input aria-label="Wait" type="number" min={0} max={999} className="input w-24" value={wait.n} onChange={(e) => setWait({ ...wait, n: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          <Select label="Wait unit" className="w-auto" value={String(wait.unit)} onChange={(u) => setWait({ ...wait, unit: Number(u) })} options={{ "1": "minutes", "60": "hours", "1440": "days" }} />
          <span className="text-charcoal-500">0 = straight away</span>
        </div>
        {wait.n > 0 && (
          <p className="mt-2 text-xs text-charcoal-500">
            After waiting, the conditions are checked again{def.option?.endsWith("Status") && config.status ? ", and it must still be in that status" : ""}. If not, nothing is done. Waits finish within a day (the daily check), or sooner when someone opens the dashboard.
          </p>
        )}
      </Step>

      <Step word="Then" title="What it does, in this order">
        {actions.length === 0 && <p className="text-sm text-charcoal-500">Nothing yet. Add a step below.</p>}
        <ol className="space-y-3">
          {actions.map((a, i) => {
            const ad = ACTIONS[a.type];
            return (
              <li key={i} className="rounded-md border border-charcoal-200 p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-kudu-600 text-xs font-bold text-white">{i + 1}</span>
                  <span className="flex-1 text-sm font-semibold">{ad.label}</span>
                  <button type="button" className="px-1.5 text-charcoal-500 disabled:opacity-30" disabled={i === 0} onClick={() => moveAct(i, i - 1)} aria-label="Move step up">↑</button>
                  <button type="button" className="px-1.5 text-charcoal-500 disabled:opacity-30" disabled={i === actions.length - 1} onClick={() => moveAct(i, i + 1)} aria-label="Move step down">↓</button>
                  <button type="button" className="px-1.5 text-charcoal-400 hover:text-kudu-600" onClick={() => setActions((as) => as.filter((_, j) => j !== i))} aria-label="Remove step">✕</button>
                </div>
                {"help" in ad && ad.help && <p className="mb-2 text-xs text-charcoal-500">{ad.help}</p>}
                {(a.type === "task" || a.type === "query") && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="label">{a.type === "task" ? "Task" : "Subject"}</span>
                      <input className="input" value={a.title} onChange={(e) => setAct(i, { title: e.target.value })} placeholder="e.g. Phone {customer} about {number}" />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label">Details</span>
                      <textarea className="input" rows={2} value={a.body} onChange={(e) => setAct(i, { body: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="label">Type</span>
                      <input className="input" list={`cats-${a.type}`} value={a.category} onChange={(e) => setAct(i, { category: e.target.value })} />
                    </label>
                    <label className="block">
                      <span className="label">Priority</span>
                      <Select label="Priority" value={a.priority} onChange={(p) => setAct(i, { priority: p as WorkflowAction["priority"] })} options={PRIORITIES} />
                    </label>
                    {a.type === "task" && (
                      <>
                        <label className="block">
                          <span className="label">Due in (hours)</span>
                          <input type="number" min={0} className="input" value={a.dueHours} onChange={(e) => setAct(i, { dueHours: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                        </label>
                        <label className="block">
                          <span className="label">Give it to</span>
                          <Select label="Give it to" value={a.assign} onChange={(assign) => setAct(i, { assign })} options={assignOptions} />
                        </label>
                      </>
                    )}
                  </div>
                )}
                {a.type === "email" && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className="label">Send from the mailbox of</span>
                      <Select label="From" value={a.from} onChange={(from) => setAct(i, { from })} options={{ "": Object.keys(lists.mailboxes).length ? "Choose…" : "Nobody has connected a mailbox yet", ...lists.mailboxes }} />
                    </label>
                    <label className="block">
                      <span className="label">To</span>
                      <Select label="To" value={a.to} onChange={(to) => setAct(i, { to })} options={emailTo} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label">Subject</span>
                      <input className="input" value={a.title} onChange={(e) => setAct(i, { title: e.target.value })} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="label">Message</span>
                      <textarea className="input" rows={6} value={a.body} onChange={(e) => setAct(i, { body: e.target.value })} />
                    </label>
                  </div>
                )}
                {a.type === "jobStatus" && (
                  <Select label="New status" value={a.status} onChange={(status) => setAct(i, { status })} options={{ "": "Choose…", ...lists.jobStatuses }} />
                )}
                {a.type === "quoteStatus" && (
                  <Select label="New status" value={a.status} onChange={(status) => setAct(i, { status })} options={{ "": "Choose…", ...QUOTE_STATUSES }} />
                )}
                {a.type === "makeDoc" && (
                  <Select
                    label="Template"
                    value={a.templateId}
                    onChange={(templateId) => setAct(i, { templateId })}
                    options={{
                      "": Object.values(lists.templates).some((t) => t.subject === subject) ? "Choose…" : `No templates for a ${SUBJECT_LABELS[subject]} yet`,
                      ...Object.fromEntries(Object.entries(lists.templates).filter(([, t]) => t.subject === subject).map(([k, t]) => [k, t.name])),
                    }}
                  />
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-3 flex flex-wrap gap-2">
          {allowedActions.map(([k, ad]) => (
            <button key={k} type="button" className="btn-outline py-1 text-xs" onClick={() => setActions((as) => [...as, blankAction(k as ActionType)])}>
              + {ad.label}
            </button>
          ))}
        </div>
        <datalist id="cats-task">{taskCategories.map((c) => <option key={c} value={c} />)}</datalist>
        <datalist id="cats-query">{queryCategories.map((c) => <option key={c} value={c} />)}</datalist>
        <details className="mt-4 text-xs text-charcoal-600">
          <summary className="cursor-pointer font-medium">Words you can use in titles and messages</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {Object.entries(PLACEHOLDERS).map(([k, v]) => (
              <li key={k}>
                <code className="rounded bg-charcoal-100 px-1">{`{${k}}`}</code> {v}
              </li>
            ))}
          </ul>
        </details>
      </Step>
    </div>
  );
}
