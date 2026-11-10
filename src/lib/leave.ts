// Leave requests: working days between two dates, skipping weekends and South African public
// holidays (Public Holidays Act: a holiday on a Sunday moves to the Monday).
import type { LeaveStatus, LeaveType } from "@prisma/client";

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ANNUAL: "Annual leave",
  SICK: "Sick leave",
  FAMILY: "Family responsibility",
  STUDY: "Study leave",
  UNPAID: "Unpaid leave",
  OTHER: "Other",
};
export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = { PENDING: "Waiting for approval", APPROVED: "Approved", DECLINED: "Declined", CANCELLED: "Cancelled" };
export const LEAVE_STATUS_COLOURS: Record<LeaveStatus, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-kudu-100 text-kudu-700",
  CANCELLED: "bg-charcoal-100 text-charcoal-500 line-through",
};

const DAY = 86400000;
const key = (d: Date) => d.toISOString().slice(0, 10);

/** Easter Sunday (Gregorian), as UTC midnight. */
function easter(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

const holidayCache = new Map<number, Map<string, string>>();

/** South African public holidays in a year, as YYYY-MM-DD → name. */
export function publicHolidays(y: number): Map<string, string> {
  const cached = holidayCache.get(y);
  if (cached) return cached;
  const out = new Map<string, string>();
  const fixed: [number, number, string][] = [
    [1, 1, "New Year's Day"], [3, 21, "Human Rights Day"], [4, 27, "Freedom Day"], [5, 1, "Workers' Day"], [6, 16, "Youth Day"],
    [8, 9, "National Women's Day"], [9, 24, "Heritage Day"], [12, 16, "Day of Reconciliation"], [12, 25, "Christmas Day"], [12, 26, "Day of Goodwill"],
  ];
  for (const [m, d, name] of fixed) {
    const date = new Date(Date.UTC(y, m - 1, d));
    out.set(key(date), name);
    if (date.getUTCDay() === 0) out.set(key(new Date(date.getTime() + DAY)), `${name} (observed)`);
  }
  const e = easter(y);
  out.set(key(new Date(e.getTime() - 2 * DAY)), "Good Friday");
  out.set(key(new Date(e.getTime() + DAY)), "Family Day");
  holidayCache.set(y, out);
  return out;
}

/** "YYYY-MM-DD" → UTC midnight, or null. */
export function dateOnly(v: string): Date | null {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Working days from `start` to `end` inclusive (UTC midnights): no weekends or public holidays. */
export function workingDays(start: Date, end: Date): number {
  let n = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += DAY) {
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6 && !publicHolidays(d.getUTCFullYear()).has(key(d))) n++;
  }
  return n;
}

/** "Mon 3 Nov – Fri 7 Nov 2026" style range for date-only values. */
export function fmtLeaveRange(start: Date, end: Date, halfDay = false): string {
  const f = (d: Date, year: boolean) =>
    new Intl.DateTimeFormat("en-ZA", { weekday: "short", day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(d);
  if (key(start) === key(end)) return `${f(start, true)}${halfDay ? " (half day)" : ""}`;
  return `${f(start, start.getUTCFullYear() !== end.getUTCFullYear())} – ${f(end, true)}`;
}

export const fmtDays = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;
