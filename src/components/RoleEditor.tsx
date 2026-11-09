"use client";

import { useState } from "react";
import { saveRole } from "@/app/actions/roles";
import { Field } from "./ui";

export type PermissionRow = { permission: string; group: string; label: string; help?: string };

/**
 * Name, description, base role and the tick boxes of a custom role. "Copy Office/Technician"
 * ticks exactly what that built-in role has, as a starting point.
 */
export function RoleEditor({
  role,
  rows,
  presets,
}: {
  role?: { id: string; name: string; description: string; baseRole: string; permissions: string[] };
  rows: PermissionRow[];
  presets: Record<"OFFICE" | "TECHNICIAN", string[]>;
}) {
  const [ticked, setTicked] = useState<Set<string>>(new Set(role?.permissions ?? presets.OFFICE));
  const [base, setBase] = useState(role?.baseRole ?? "OFFICE");
  const groups = [...new Set(rows.map((r) => r.group))];
  const toggle = (p: string, on: boolean) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(p);
      else next.delete(p);
      return next;
    });

  return (
    <form action={saveRole} className="space-y-5">
      {role && <input type="hidden" name="id" value={role.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role name *">
          <input name="name" required maxLength={60} className="input" defaultValue={role?.name} placeholder="e.g. Sales rep, Supervisor, Bookkeeper" />
        </Field>
        <Field label="Falls back to">
          <select name="baseRole" className="input" value={base} onChange={(e) => setBase(e.target.value)}>
            <option value="OFFICE">Office</option>
            <option value="TECHNICIAN">Technician</option>
          </select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <input name="description" maxLength={300} className="input" defaultValue={role?.description} placeholder="Who this role is for" />
        </Field>
      </div>
      <p className="text-xs text-charcoal-500">
        “Falls back to” is the built-in role its users get if this role is deleted, and how they are listed when assigning jobs.
      </p>

      <div className="flex flex-wrap gap-2">
        <span className="self-center text-xs font-semibold uppercase tracking-wide text-charcoal-500">Start from</span>
        <button type="button" className="btn-outline py-1 text-xs" onClick={() => setTicked(new Set(presets.OFFICE))}>Office</button>
        <button type="button" className="btn-outline py-1 text-xs" onClick={() => setTicked(new Set(presets.TECHNICIAN))}>Technician</button>
        <button type="button" className="btn-outline py-1 text-xs" onClick={() => setTicked(new Set())}>Nothing</button>
        <span className="self-center text-xs text-charcoal-500">{ticked.size} of {rows.length} ticked</span>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {groups.map((g) => (
          <fieldset key={g} className="rounded-md border border-charcoal-100 p-4">
            <legend className="px-1 text-sm font-bold text-kudu-600">{g}</legend>
            <div className="space-y-2">
              {rows.filter((r) => r.group === g).map((r) => (
                <label key={r.permission} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="permissions"
                    value={r.permission}
                    checked={ticked.has(r.permission)}
                    onChange={(e) => toggle(r.permission, e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    {r.label}
                    {r.help && <span className="block text-xs text-charcoal-500">{r.help}</span>}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {(ticked.has("users.manage") || ticked.has("settings.manage")) && (
        <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          Company settings and Manage users are powerful: people with them can change settings and add or reset other users (but not admins, and not their own role).
        </p>
      )}
      <button className="btn-primary">Save role</button>
    </form>
  );
}
