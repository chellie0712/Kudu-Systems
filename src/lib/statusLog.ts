// Job card status history: one row per change, written wherever a job card's status changes.
// The process monitor (src/lib/monitor.ts) reads it to show how long jobs spend in each step.
import type { JobCardStatus, Prisma, PrismaClient } from "@prisma/client";
import { stageLabel } from "./jobStatus";

type Tx = PrismaClient | Prisma.TransactionClient;
export type StatusValue = { status: JobCardStatus; statusId: string | null };

/** The status's display name: the custom status's name, else the stage's. */
export async function statusName(db: Tx, v: StatusValue): Promise<string> {
  if (v.statusId) {
    const s = await db.jobStatus.findUnique({ where: { id: v.statusId }, select: { name: true } });
    if (s) return s.name;
  }
  return stageLabel(v.status);
}

/**
 * Records a status change. `before` is null when the job card was just created. Nothing is
 * written when the status did not change.
 */
export async function logStatusChange(db: Tx, jobCardId: string, before: StatusValue | null, after: StatusValue, byName: string) {
  if (before && before.status === after.status && (before.statusId ?? null) === (after.statusId ?? null)) return;
  await db.jobStatusChange.create({
    data: {
      jobCardId,
      fromStatus: before?.status ?? null,
      fromStatusId: before?.statusId ?? null,
      fromName: before ? await statusName(db, before) : "",
      toStatus: after.status,
      toStatusId: after.statusId ?? null,
      toName: await statusName(db, after),
      byName: byName.slice(0, 120),
    },
  });
}
