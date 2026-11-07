import Link from "next/link";

export function StatusFilter({ base, current, q, statuses }: { base: string; current?: string; q: string; statuses: (string | { value: string; label: string })[] }) {
  return (
    <form className="mb-4 flex flex-wrap items-center gap-2">
      <input name="q" defaultValue={q} placeholder="Search number, title or customer" className="input max-w-xs" />
      <select name="status" defaultValue={current ?? ""} className="input w-auto">
        <option value="">All statuses</option>
        {statuses.map((s) => {
          const o = typeof s === "string" ? { value: s, label: s.replace(/_/g, " ") } : s;
          return <option key={o.value} value={o.value}>{o.label}</option>;
        })}
      </select>
      <button className="btn-dark">Filter</button>
      {(current || q) && <Link href={base} className="text-sm text-charcoal-500 hover:text-kudu-600">Clear</Link>}
    </form>
  );
}
