import type { JobCardStatus, JobStatus } from "@prisma/client";
import { colourClass } from "@/lib/jobStatus";
import { StatusBadge } from "./ui";

/** A job card's status: its custom status when it has one, else the built-in stage. */
export function JobStatusBadge({ status, custom }: { status: JobCardStatus; custom?: Pick<JobStatus, "name" | "colour"> | null }) {
  if (!custom) return <StatusBadge status={status} />;
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${colourClass(custom.colour)}`}>{custom.name}</span>
  );
}
