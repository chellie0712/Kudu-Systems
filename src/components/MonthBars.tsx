import { monthLabel } from "@/lib/reports";

/**
 * Single-series column chart, one column per month. Server-rendered; each column shows its
 * exact value on hover/focus. Charts that should be compared pass the same `max` so they share a scale.
 */
export function MonthBars({
  title,
  months,
  values,
  max,
  format,
}: {
  title: string;
  months: string[];
  values: Map<string, number>;
  max: number;
  format: (n: number) => string;
}) {
  const top = Math.max(max, 1);
  const total = months.reduce((s, m) => s + (values.get(m) ?? 0), 0);
  return (
    <figure className="card p-5">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold text-charcoal-700">{title}</span>
        <span className="text-sm font-semibold tabular-nums text-charcoal-800">{format(total)}</span>
      </figcaption>
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-charcoal-200" aria-hidden />
        <div className="pointer-events-none absolute -top-2 right-0 bg-white pl-1 text-[10px] text-charcoal-400 tabular-nums" aria-hidden>{format(top)}</div>
        <div className="flex h-40 items-end gap-0.5 border-b border-charcoal-300 pt-3" role="img" aria-label={`${title} per month`}>
          {months.map((m) => {
            const v = values.get(m) ?? 0;
            const h = v > 0 ? Math.max(2, (v / top) * 100) : 0;
            return (
              <div key={m} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none" title={`${monthLabel(m)}: ${format(v)}`}>
                <div className="w-full max-w-6 rounded-t-[4px] bg-kudu-600 transition-opacity group-hover:opacity-80 group-focus:opacity-80" style={{ height: `${h}%` }} />
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 hidden rounded bg-charcoal-800 px-2 py-1 text-xs whitespace-nowrap text-white shadow group-hover:block group-focus:block">
                  {monthLabel(m)} · {format(v)}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-0.5 text-[10px] text-charcoal-500">
          {months.map((m, i) => (
            <div key={m} className="min-w-0 flex-1 truncate text-center">{months.length <= 12 || i % 2 === 0 ? monthLabel(m) : ""}</div>
          ))}
        </div>
      </div>
    </figure>
  );
}
