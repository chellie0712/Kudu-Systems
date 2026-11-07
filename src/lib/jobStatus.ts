import type { JobCardStatus } from "@prisma/client";

/** The four built-in stages. Every custom status belongs to one of them. */
export const STAGES: { value: JobCardStatus; label: string }[] = [
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export const stageLabel = (s: JobCardStatus) => STAGES.find((x) => x.value === s)?.label ?? s;

/** Badge colours for custom statuses. Full class names, so Tailwind includes them. */
export const STATUS_COLOURS: Record<string, { label: string; className: string }> = {
  slate: { label: "Grey", className: "bg-charcoal-100 text-charcoal-700" },
  sky: { label: "Blue", className: "bg-sky-100 text-sky-800" },
  amber: { label: "Amber", className: "bg-amber-100 text-amber-800" },
  emerald: { label: "Green", className: "bg-emerald-100 text-emerald-800" },
  violet: { label: "Purple", className: "bg-violet-100 text-violet-800" },
  rose: { label: "Pink", className: "bg-rose-100 text-rose-800" },
  red: { label: "Red", className: "bg-kudu-600 text-white" },
  dark: { label: "Charcoal", className: "bg-charcoal-700 text-white" },
};

export const colourClass = (key: string) => (STATUS_COLOURS[key] ?? STATUS_COLOURS.slate).className;

/**
 * Status values in the job card form: a stage ("IN_PROGRESS") or a custom status ("custom:<id>").
 */
export const CUSTOM_PREFIX = "custom:";
