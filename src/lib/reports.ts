import { addDays, dayKey, fromLocalInput } from "@/lib/format";

/** A report period: [from, to) as moments, plus the date inputs' values. */
export type Period = { from: Date; to: Date; fromInput: string; toInput: string; label: string };

const monthStart = (key: string) => `${key.slice(0, 7)}-01`;
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};

export const PRESETS = ["12m", "month", "lastmonth", "quarter", "year", "lastyear"] as const;
export const PRESET_LABELS: Record<(typeof PRESETS)[number], string> = {
  "12m": "Last 12 months",
  month: "This month",
  lastmonth: "Last month",
  quarter: "This quarter",
  year: "This year",
  lastyear: "Last year",
};

/** Reads ?from=&to= (YYYY-MM-DD, both inclusive) or ?preset=; defaults to the last 12 months. */
export function periodFrom(sp: { from?: string; to?: string; preset?: string }, now = new Date()): Period {
  const today = dayKey(now);
  const ym = today.slice(0, 7);
  let fromInput: string;
  let toInput = today;
  let label: string;
  const valid = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (valid(sp.from) && valid(sp.to) && sp.from! <= sp.to!) {
    fromInput = sp.from!;
    toInput = sp.to!;
    label = "Custom";
  } else {
    const preset = (PRESETS as readonly string[]).includes(sp.preset ?? "") ? (sp.preset as (typeof PRESETS)[number]) : "12m";
    label = PRESET_LABELS[preset];
    const y = Number(today.slice(0, 4));
    if (preset === "month") fromInput = monthStart(today);
    else if (preset === "lastmonth") {
      fromInput = `${shiftMonth(ym, -1)}-01`;
      toInput = dayKey(addDays(fromLocalInput(`${ym}-01`)!, -1));
    } else if (preset === "quarter") {
      const m = Number(ym.slice(5, 7));
      fromInput = `${y}-${String(Math.floor((m - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
    } else if (preset === "year") fromInput = `${y}-01-01`;
    else if (preset === "lastyear") {
      fromInput = `${y - 1}-01-01`;
      toInput = `${y - 1}-12-31`;
    } else fromInput = `${shiftMonth(ym, -11)}-01`;
  }
  return { from: fromLocalInput(fromInput)!, to: addDays(fromLocalInput(toInput)!, 1), fromInput, toInput, label };
}

/** The YYYY-MM months a period covers, in order. */
export function monthsOf(p: Period): string[] {
  const out: string[] = [];
  let m = p.fromInput.slice(0, 7);
  const last = p.toInput.slice(0, 7);
  while (m <= last && out.length < 60) {
    out.push(m);
    m = shiftMonth(m, 1);
  }
  return out;
}

export const monthLabel = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1)).toLocaleDateString("en-ZA", { month: "short", year: "2-digit", timeZone: "UTC" });

/** Sums values per month key. */
export function byMonth<T>(rows: T[], date: (r: T) => Date, value: (r: T) => number): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const k = dayKey(date(r)).slice(0, 7);
    m.set(k, (m.get(k) ?? 0) + value(r));
  }
  return m;
}

export const AGE_BUCKETS = ["Not yet due", "1–30 days", "31–60 days", "61–90 days", "90+ days"] as const;

/** Index into AGE_BUCKETS for an invoice's due date. */
export function ageBucket(due: Date, now = new Date()): number {
  const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return 0;
  if (days <= 30) return 1;
  if (days <= 60) return 2;
  if (days <= 90) return 3;
  return 4;
}

export const FORECAST_BUCKETS = ["Overdue", "Due in 7 days", "8–30 days", "31–60 days", "Later"] as const;

/** Index into FORECAST_BUCKETS: when an outstanding balance is expected, by its due date. */
export function forecastBucket(due: Date, now = new Date()): number {
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return 0;
  if (days <= 7) return 1;
  if (days <= 30) return 2;
  if (days <= 60) return 3;
  return 4;
}

/** A CSV cell. */
export function csv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
