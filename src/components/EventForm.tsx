import type { CalendarEvent, Customer } from "@prisma/client";
import { saveEvent } from "@/app/actions/calendar";
import { toDateTimeInput } from "@/lib/format";
import { Field } from "./ui";

/** Create / edit a calendar event. Pass customerId to lock it to one customer. */
export function EventForm({
  event,
  customers,
  customerId,
  returnTo,
  defaultStart,
}: {
  event?: CalendarEvent;
  customers?: Pick<Customer, "id" | "name">[];
  customerId?: string;
  returnTo: string;
  defaultStart?: string;
}) {
  const allDayStart = event?.allDay ? event.start.toISOString().slice(0, 10) : "";
  const allDayEnd = event?.allDay ? new Date(event.end.getTime() - 86400000).toISOString().slice(0, 10) : "";
  return (
    <form action={saveEvent} className="space-y-3">
      {event && <input type="hidden" name="id" value={event.id} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      <Field label="Title *">
        <input name="title" required className="input" defaultValue={event?.title} placeholder="Site visit, follow-up call…" />
      </Field>
      {customerId ? (
        <input type="hidden" name="customerId" value={customerId} />
      ) : (
        <Field label="Customer">
          <select name="customerId" className="input" defaultValue={event?.customerId ?? ""}>
            <option value="">— Not linked —</option>
            {customers?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Start">
          <input name="start" type="datetime-local" className="input" defaultValue={event && !event.allDay ? toDateTimeInput(event.start) : defaultStart} />
        </Field>
        <Field label="End">
          <input name="end" type="datetime-local" className="input" defaultValue={event && !event.allDay ? toDateTimeInput(event.end) : ""} />
        </Field>
      </div>
      <details className="text-sm" open={event?.allDay}>
        <summary className="cursor-pointer text-charcoal-500">All-day event</summary>
        <div className="mt-2 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allDay" defaultChecked={event?.allDay} className="accent-kudu-600" /> All day
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From date"><input name="date" type="date" className="input" defaultValue={allDayStart || (defaultStart ? defaultStart.slice(0, 10) : "")} /></Field>
            <Field label="To date"><input name="endDate" type="date" className="input" defaultValue={allDayEnd} /></Field>
          </div>
        </div>
      </details>
      <Field label="Location">
        <input name="location" className="input" defaultValue={event?.location} />
      </Field>
      <Field label="Description">
        <textarea name="description" rows={3} className="input" defaultValue={event?.description} />
      </Field>
      <button className="btn-primary">{event ? "Save event" : "Add event"}</button>
      {event?.googleEventId && <p className="text-xs text-charcoal-500">Linked to Google Calendar.</p>}
    </form>
  );
}
