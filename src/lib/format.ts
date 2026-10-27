// Money is stored as integer cents. Dates are shown in the business time zone.

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Johannesburg";

export function money(cents: number, symbol = "R"): string {
  const value = (cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${symbol} ${value}`;
}

/** Parse a user-entered amount like "1 250,50" or "1250.50" into cents. */
export function toCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  if (typeof input === "number") return Math.round(input * 100);
  const cleaned = input.replace(/\s/g, "").replace(/,(\d{1,2})$/, ".$1").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

const dateFmt = new Intl.DateTimeFormat("en-ZA", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const timeFmt = new Intl.DateTimeFormat("en-ZA", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function fmtDate(d: Date | null | undefined): string {
  return d ? dateFmt.format(d) : "";
}
export function fmtTime(d: Date | null | undefined): string {
  return d ? timeFmt.format(d) : "";
}
export function fmtDateTime(d: Date | null | undefined): string {
  return d ? `${fmtDate(d)} ${fmtTime(d)}` : "";
}

function parts(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") === "24" ? "00" : get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** YYYY-MM-DD of a moment, in the business time zone. */
export function dayKey(d: Date): string {
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Value for <input type="date"> */
export function toDateInput(d: Date | null | undefined): string {
  return d ? dayKey(d) : "";
}

/** Value for <input type="datetime-local"> */
export function toDateTimeInput(d: Date | null | undefined): string {
  if (!d) return "";
  const p = parts(d);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Offset of the business time zone from UTC at a given moment, in ms. */
function tzOffset(d: Date): number {
  const p = parts(d);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
}

/** Interpret "YYYY-MM-DDTHH:mm" or "YYYY-MM-DD" as wall-clock time in the business time zone. */
export function fromLocalInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0));
  const first = guess - tzOffset(new Date(guess));
  // Second pass handles DST boundaries in zones that have them.
  return new Date(guess - tzOffset(new Date(first)));
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86400000);
}
