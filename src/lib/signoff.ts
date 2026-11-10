import { JobCardStatus, type JobCard } from "@prisma/client";
import type { TenantDb } from "@/lib/db";
import { incompleteRequired, parseItems } from "@/lib/checklists";
import { syncJobCardEvent } from "@/lib/jobCardCalendar";
import { logStatusChange } from "@/lib/statusLog";
import { emit } from "@/lib/workflows/events";

export type SignOffInput = { name: string; signature: string; confirmed: boolean; rating?: number | null; feedback?: string };

/** What still stops the client signing off this job; empty when it can be signed. */
export async function signOffProblems(db: TenantDb, jc: Pick<JobCard, "id" | "status" | "workDescription">, input: SignOffInput): Promise<string[]> {
  if (jc.status === JobCardStatus.CANCELLED) return ["ask the office to reopen the job (it was cancelled)"];
  const lists = await db.jobCardChecklist.findMany({ where: { jobCardId: jc.id } });
  const unfinished = incompleteRequired(lists.map((l) => ({ ...l, items: parseItems(l.items) })));
  return [
    !jc.workDescription.trim() && "describe the work done on the job card",
    unfinished.length > 0 && `tick everything on ${unfinished.join(", ")}`,
    !input.name.trim() && "enter the client's name",
    !/^data:image\/(png|jpeg);base64,/.test(input.signature) && "get the client's signature",
    !input.confirmed && "tick the confirmation box",
  ].filter(Boolean) as string[];
}

/** Records the client's sign-off, completes the job, stops running timers and updates the calendar. */
export async function applySignOff(db: TenantDb, jc: Pick<JobCard, "id" | "jobDate" | "warrantyNo" | "number">, input: SignOffInput, signedAt = new Date()) {
  const now = new Date();
  const stars = Number(input.rating);
  const before = await db.jobCard.findUnique({ where: { id: jc.id }, select: { status: true, statusId: true } });
  await db.jobCard.update({
    where: { id: jc.id },
    data: {
      clientConfirmed: true,
      customerSignName: input.name.trim(),
      customerSignature: input.signature,
      signedAt,
      customerRating: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null,
      customerFeedback: (input.feedback ?? "").trim().slice(0, 2000),
      status: JobCardStatus.COMPLETED,
      statusId: null,
      jobDate: jc.jobDate ?? signedAt,
      warrantyNo: jc.warrantyNo || jc.number,
    },
  });
  await logStatusChange(db, jc.id, before, { status: JobCardStatus.COMPLETED, statusId: null }, `Client sign-off (${input.name.trim()})`);
  // The job is finished, so nobody is still working on it.
  await db.timeEntry.updateMany({ where: { jobCardId: jc.id, end: null }, data: { end: now } });
  await syncJobCardEvent(jc.id);
  await emit(db, "job.signedOff", jc.id);
}
