import Link from "next/link";
import { PRESET_LABELS, PRESETS, type Period } from "@/lib/reports";

/** Preset chips plus a from/to form, for any page that reads periodFrom(searchParams). */
export function PeriodPicker({ path, p }: { path: string; p: Period }) {
  return (
    <div className="no-print mb-6 flex flex-wrap items-end gap-2">
      {PRESETS.map((k) => (
        <Link
          key={k}
          href={`${path}?preset=${k}`}
          className={`rounded-full px-3 py-1 text-sm font-medium ${p.label === PRESET_LABELS[k] ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200 hover:text-kudu-600"}`}
        >
          {PRESET_LABELS[k]}
        </Link>
      ))}
      <form className="ml-auto flex flex-wrap items-end gap-2">
        <label className="block"><span className="label">From</span><input type="date" name="from" defaultValue={p.fromInput} className="input w-40 py-1.5" /></label>
        <label className="block"><span className="label">To</span><input type="date" name="to" defaultValue={p.toInput} className="input w-40 py-1.5" /></label>
        <button className="btn-dark py-1.5">Show</button>
      </form>
    </div>
  );
}
