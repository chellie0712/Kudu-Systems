"use client";

import { useState } from "react";

export type Assignee = { id: string; name: string; role: string };

/**
 * "Assigned to" (a user, so the job shows on their My Job Cards) plus the technician
 * name printed on the card, which follows the chosen user unless typed over.
 */
export function TechnicianPicker({
  assignees,
  technicianId,
  technician,
  disabled,
}: {
  assignees: Assignee[];
  technicianId?: string | null;
  technician?: string;
  disabled?: boolean;
}) {
  const [id, setId] = useState(technicianId ?? "");
  const [name, setName] = useState(technician ?? "");
  const nameOf = (uid: string) => assignees.find((a) => a.id === uid)?.name ?? "";
  // Technicians first, then everyone else who could do the job.
  const sorted = [...assignees].sort((a, b) => Number(b.role === "TECHNICIAN") - Number(a.role === "TECHNICIAN") || a.name.localeCompare(b.name));

  return (
    <>
      <label className="block">
        <span className="label">Assigned to</span>
        <select
          name="technicianId"
          className="input"
          value={id}
          disabled={disabled}
          onChange={(e) => {
            const next = e.target.value;
            // Keep a hand-typed name; replace one that came from the previous choice.
            if (!name || name === nameOf(id)) setName(nameOf(next));
            setId(next);
          }}
        >
          <option value="">Nobody yet</option>
          {sorted.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.role === "TECHNICIAN" ? "" : a.role === "ADMIN" ? " (admin)" : " (office)"}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label">Technician name (printed)</span>
        <input name="technician" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" disabled={disabled} />
      </label>
    </>
  );
}
