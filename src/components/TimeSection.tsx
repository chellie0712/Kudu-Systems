import type { Settings, TimeEntry } from "@prisma/client";
import type { AppUser } from "@/auth";
import { addTimeEntry, billLabourToDraft, deleteTimeEntry, setTimeBillable, startTimer, stopTimer } from "@/app/actions/time";
import { can } from "@/lib/permissions";
import { entryMinutes, fmtMinutes, labourLines, unbilled } from "@/lib/labour";
import { fmtDate, fmtTime, money, toDateInput } from "@/lib/format";
import { lineTotal } from "@/lib/totals";
import { ConfirmButton } from "./ConfirmButton";
import { SectionTitle } from "./ui";

type Person = { id: string; name: string; labourRate: number | null };

/** Time worked on a job card: timers, entries, totals and (for the office) labour value. */
export function TimeSection({
  jobCardId,
  entries,
  user,
  people,
  settings,
  hasDraftInvoice,
}: {
  jobCardId: string;
  entries: (TimeEntry & { invoice: { id: string; number: string } | null })[];
  user: AppUser;
  people: Person[];
  settings: Pick<Settings, "labourRate" | "labourDescription" | "labourRoundMinutes" | "currencySymbol">;
  hasDraftInvoice: boolean;
}) {
  const manage = can(user, "time.manageAll");
  const mine = entries.find((e) => !e.end && e.userId === user.id);
  const running = entries.filter((e) => !e.end);
  const total = entries.reduce((s, e) => s + entryMinutes(e), 0);
  const open = unbilled(entries);
  const lines = manage ? labourLines(open, people, settings) : [];
  const value = lines.reduce((s, l) => s + lineTotal(l), 0);
  const sym = settings.currencySymbol;

  return (
    <div id="time" className="no-print card mx-auto mt-6 max-w-3xl p-6">
      <SectionTitle>Time on this job</SectionTitle>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {mine ? (
          <form action={stopTimer} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={mine.id} />
            <span className="flex items-center gap-2 text-sm font-medium text-kudu-700">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-kudu-600" /> Your timer is running since {fmtTime(mine.start)}
            </span>
            <input name="note" className="input w-56 py-1.5" placeholder="What did you do? (optional)" />
            <button className="btn-primary py-1.5">■ Stop timer</button>
          </form>
        ) : (
          <form action={startTimer}>
            <input type="hidden" name="jobCardId" value={jobCardId} />
            <button className="btn-primary py-1.5">▶ Start timer</button>
          </form>
        )}
        <span className="ml-auto text-sm text-charcoal-600">
          Total recorded: <b>{fmtMinutes(total)}</b>
          {running.length > 0 && ` (+ ${running.length} running)`}
        </span>
      </div>

      {entries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Who</th>
                <th>Date</th>
                <th>Time</th>
                <th className="text-right">Duration</th>
                <th>Note</th>
                <th>Billing</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => {
                const own = e.userId === user.id;
                return (
                  <tr key={e.id}>
                    <td>{e.userName}</td>
                    <td>{fmtDate(e.start)}</td>
                    <td className="whitespace-nowrap">{fmtTime(e.start)} – {e.end ? fmtTime(e.end) : <span className="font-medium text-kudu-600">running</span>}</td>
                    <td className="text-right tabular-nums">{e.end ? fmtMinutes(entryMinutes(e)) : "—"}</td>
                    <td className="text-sm">{e.note}</td>
                    <td className="text-xs whitespace-nowrap">
                      {e.invoice ? (
                        manage ? <a href={`/invoices/${e.invoice.id}`} className="text-kudu-600 hover:underline">On {e.invoice.number}</a> : "Billed"
                      ) : manage ? (
                        <form action={setTimeBillable}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="billable" value={String(!e.billable)} />
                          <button className="hover:text-kudu-600" title="Switch between billable and not billable">{e.billable ? "Billable" : "Not billable"}</button>
                        </form>
                      ) : e.billable ? "Billable" : "Not billable"}
                    </td>
                    <td className="text-right">
                      {!e.end && !own && manage && (
                        <form action={stopTimer} className="inline">
                          <input type="hidden" name="id" value={e.id} />
                          <button className="text-xs text-charcoal-500 hover:text-kudu-600">Stop</button>
                        </form>
                      )}
                      {!e.invoice && (own || manage) && (
                        <form action={deleteTimeEntry} className="inline">
                          <input type="hidden" name="id" value={e.id} />
                          <ConfirmButton message="Delete this time entry?" className="ml-2 text-xs text-charcoal-400 hover:text-kudu-600">Delete</ConfirmButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <form action={addTimeEntry} className="mt-4 flex flex-wrap items-end gap-2 border-t border-charcoal-100 pt-4">
        <input type="hidden" name="jobCardId" value={jobCardId} />
        {manage && (
          <label className="block">
            <span className="label">Who</span>
            <select name="userId" defaultValue={user.id} className="input w-44">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label className="block">
          <span className="label">Date</span>
          <input name="date" type="date" required className="input w-40" defaultValue={toDateInput(new Date())} />
        </label>
        <label className="block">
          <span className="label">From</span>
          <input name="startTime" type="time" required className="input w-28" />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input name="endTime" type="time" required className="input w-28" />
        </label>
        <label className="block min-w-40 flex-1">
          <span className="label">Note</span>
          <input name="note" className="input" placeholder="Optional" />
        </label>
        {manage && (
          <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="billable" defaultChecked className="accent-kudu-600" /> Billable</label>
        )}
        <button className="btn-outline">+ Add time</button>
      </form>

      {manage && (
        <div className="mt-4 rounded-md bg-charcoal-50 p-3 text-sm">
          {lines.length === 0 ? (
            <p className="text-charcoal-500">No unbilled time. Labour is added to the invoice when you use “Create invoice”.</p>
          ) : (
            <>
              <p className="mb-1 font-medium">Unbilled labour: {money(value, sym)} excl. VAT</p>
              <ul className="mb-2 text-charcoal-600">
                {lines.map((l) => (
                  <li key={l.description + l.unitPrice}>
                    {l.description}: {l.quantity} h × {money(l.unitPrice, sym)}/h
                    {l.unitPrice === 0 && <span className="text-kudu-700"> (no rate set: Settings → Labour billing)</span>}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-charcoal-500">
                Time is rounded up to {settings.labourRoundMinutes || 1} minutes per person. “Create invoice” above includes it
                {hasDraftInvoice ? ", or add it to this job's draft invoice:" : "."}
              </p>
              {hasDraftInvoice && (
                <form action={billLabourToDraft} className="mt-2">
                  <input type="hidden" name="jobCardId" value={jobCardId} />
                  <button className="btn-dark py-1.5">Add labour to draft invoice</button>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
