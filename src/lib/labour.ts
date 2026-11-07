import type { LineItemInput } from "./totals";

type Entry = { start: Date; end: Date | null; billable: boolean; invoiceId: string | null; userId: string | null; userName: string };
type RateUser = { id: string; labourRate: number | null };

/** Minutes of a finished entry; a running timer counts as 0 until it is stopped. */
export function entryMinutes(e: Pick<Entry, "start" | "end">): number {
  if (!e.end) return 0;
  return Math.max(0, Math.round((e.end.getTime() - e.start.getTime()) / 60000));
}

export function fmtMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** Billed minutes: rounded up to the company's increment (0 or less = exact minutes). */
export function roundUp(min: number, step: number): number {
  return step > 0 ? Math.ceil(min / step) * step : min;
}

/** Entries that can still be billed: finished, billable and not on an invoice yet. */
export function unbilled<T extends Entry>(entries: T[]): T[] {
  return entries.filter((e) => e.end && e.billable && !e.invoiceId && entryMinutes(e) > 0);
}

/**
 * Invoice lines for unbilled time: one line per hourly rate (a user's own rate, else the
 * company rate). Quantity is hours after rounding each person's total up to the increment.
 */
export function labourLines(
  entries: Entry[],
  users: RateUser[],
  settings: { labourRate: number; labourDescription: string; labourRoundMinutes: number },
): LineItemInput[] {
  const rateOf = (userId: string | null) => users.find((u) => u.id === userId)?.labourRate ?? settings.labourRate;
  // Total minutes per person first, so rounding happens once per person, not per entry.
  const perPerson = new Map<string, { name: string; rate: number; minutes: number }>();
  for (const e of unbilled(entries)) {
    const key = e.userId ?? `name:${e.userName}`;
    const p = perPerson.get(key) ?? { name: e.userName, rate: rateOf(e.userId), minutes: 0 };
    p.minutes += entryMinutes(e);
    perPerson.set(key, p);
  }
  const perRate = new Map<number, { names: string[]; minutes: number }>();
  for (const p of perPerson.values()) {
    const r = perRate.get(p.rate) ?? { names: [], minutes: 0 };
    r.names.push(p.name);
    r.minutes += roundUp(p.minutes, settings.labourRoundMinutes);
    perRate.set(p.rate, r);
  }
  return [...perRate.entries()].map(([rate, r]) => ({
    description: `${settings.labourDescription || "Labour"}${r.names.filter(Boolean).length ? ` – ${r.names.filter(Boolean).join(", ")}` : ""}`,
    quantity: Math.round((r.minutes / 60) * 100) / 100,
    unit: "h",
    unitPrice: rate,
  }));
}
