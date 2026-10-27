import Link from "next/link";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { dayKey, fmtTime, fromLocalInput } from "@/lib/format";
import { googleConfigured } from "@/lib/google";
import { syncNow } from "@/app/actions/calendar";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { EventForm } from "@/components/EventForm";

export const metadata = { title: "Calendar" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; customerId?: string; day?: string; msg?: string; err?: string }>;
}) {
  await requireUser();
  const sp = await searchParams;
  const todayKey = dayKey(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayKey.slice(0, 7);
  const [y, m] = month.split("-").map(Number);

  // Grid: Monday before the 1st through 6 weeks.
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => new Date(Date.UTC(y, m - 1, 1 - lead + i)).toISOString().slice(0, 10));
  const rangeStart = fromLocalInput(days[0])!;
  const rangeEnd = fromLocalInput(new Date(Date.UTC(y, m - 1, 1 - lead + 42)).toISOString().slice(0, 10))!;

  const [events, customers, settings] = await Promise.all([
    db.calendarEvent.findMany({
      where: {
        start: { lt: rangeEnd },
        end: { gt: rangeStart },
        ...(sp.customerId ? { customerId: sp.customerId } : {}),
      },
      include: { customer: { select: { name: true } } },
      orderBy: { start: "asc" },
    }),
    db.customer.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);

  // Bucket events per day; multi-day events show on every day they cover.
  const byDay = new Map<string, typeof events>();
  for (const e of events) {
    const startKey = e.allDay ? e.start.toISOString().slice(0, 10) : dayKey(e.start);
    const lastMoment = new Date(e.end.getTime() - 1);
    const endKey = e.allDay ? lastMoment.toISOString().slice(0, 10) : dayKey(lastMoment);
    for (const d of days) {
      if (d >= startKey && d <= endKey) byDay.set(d, [...(byDay.get(d) ?? []), e]);
    }
  }

  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const title = new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(first);
  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ month, customerId: sp.customerId, ...extra })) if (v) p.set(k, v);
    return `/calendar?${p}`;
  };
  const connected = googleConfigured && Boolean(settings.googleSyncUserId);
  const selectedDay = sp.day && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : undefined;

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={connected ? `Synced with Google Calendar (${settings.googleCalendarId})` : "Google Calendar not connected – set it up in Settings"}
        actions={
          connected ? (
            <form action={syncNow}>
              <input type="hidden" name="returnTo" value={qs({})} />
              <button className="btn-dark">⟳ Sync with Google</button>
            </form>
          ) : (
            <Link href="/settings#google" className="btn-outline">Connect Google Calendar</Link>
          )
        }
      />
      <Flash message={sp.msg} />
      <Flash message={sp.err} tone="error" />

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-charcoal-100 p-3">
            <div className="flex items-center gap-1">
              <Link href={qs({ month: prev })} className="btn-outline px-2.5 py-1">‹</Link>
              <Link href={qs({ month: todayKey.slice(0, 7) })} className="btn-outline py-1">Today</Link>
              <Link href={qs({ month: next })} className="btn-outline px-2.5 py-1">›</Link>
              <h2 className="ml-3 text-lg font-bold">{title}</h2>
            </div>
            <form className="flex gap-2">
              <input type="hidden" name="month" value={month} />
              <select name="customerId" defaultValue={sp.customerId ?? ""} className="input w-auto py-1">
                <option value="">All customers</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button className="btn-outline py-1">Filter</button>
            </form>
          </div>
          <div className="grid grid-cols-7 border-b border-charcoal-100 bg-charcoal-50 text-center text-xs font-semibold uppercase text-charcoal-500">
            {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const inMonth = d.slice(0, 7) === month;
              const list = byDay.get(d) ?? [];
              return (
                <div key={d} className={`min-h-28 border-b border-r border-charcoal-100 p-1 ${inMonth ? "bg-white" : "bg-charcoal-50/70"} ${selectedDay === d ? "ring-2 ring-inset ring-kudu-200" : ""}`}>
                  <Link
                    href={qs({ day: d })}
                    title="Add event on this day"
                    className={`mb-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      d === todayKey ? "bg-kudu-600 text-white" : inMonth ? "text-charcoal-700 hover:bg-charcoal-100" : "text-charcoal-400"
                    }`}
                  >
                    {Number(d.slice(8))}
                  </Link>
                  <div className="space-y-0.5">
                    {list.slice(0, 4).map((e) => (
                      <Link
                        key={e.id}
                        href={e.jobCardId ? `/job-cards/${e.jobCardId}` : `/calendar/${e.id}`}
                        className={`block truncate rounded px-1.5 py-0.5 text-[11px] leading-tight ${
                          e.jobCardId ? "bg-kudu-600 text-white hover:bg-kudu-700" : e.customerId ? "bg-charcoal-700 text-white hover:bg-charcoal-800" : "bg-charcoal-100 text-charcoal-700 hover:bg-charcoal-200"
                        }`}
                        title={`${e.title}${e.customer ? ` – ${e.customer.name}` : ""}`}
                      >
                        {!e.allDay && <span className="opacity-80">{fmtTime(e.start)} </span>}
                        {e.title}
                      </Link>
                    ))}
                    {list.length > 4 && <div className="px-1 text-[11px] text-charcoal-500">+{list.length - 4} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 p-3 text-xs text-charcoal-500">
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-kudu-600" /> Job card</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-charcoal-700" /> Customer appointment</span>
            <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-charcoal-100" /> Other / from Google</span>
          </div>
        </div>
        <div className="card h-fit p-5">
          <SectionTitle>New event</SectionTitle>
          <EventForm
            key={selectedDay}
            customers={customers}
            returnTo={qs({})}
            defaultStart={selectedDay ? `${selectedDay}T09:00` : undefined}
          />
          <p className="mt-4 text-xs text-charcoal-500">To book a job, create a job card and set its schedule; it appears here automatically.</p>
        </div>
      </div>
    </div>
  );
}
