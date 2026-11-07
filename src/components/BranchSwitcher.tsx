"use client";

import { chooseBranch } from "@/app/actions/branches";

/** Header dropdown: which branch the lists and dashboard show. */
export function BranchSwitcher({ branches, current }: { branches: { id: string; name: string }[]; current: string | null }) {
  return (
    <form action={chooseBranch}>
      <select
        name="branch"
        defaultValue={current ?? "all"}
        key={current ?? "all"}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="input w-auto py-1.5 text-sm"
        aria-label="Branch"
      >
        <option value="all">All branches</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </form>
  );
}
