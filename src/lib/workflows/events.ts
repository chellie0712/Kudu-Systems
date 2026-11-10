import type { PrismaClient } from "@prisma/client";
import type { TriggerKey } from "./defs";

/** What changed: the new status keys (a job may match its custom status and its stage), or the form. */
export type EventInfo = { status?: string | string[]; formId?: string };

/**
 * Tells the workflows that something happened, e.g. emit(db, "job.status", id, { status: "COMPLETED" }).
 * Never throws: a broken workflow must not stop the thing that triggered it. The engine is loaded on
 * demand so that the libraries it uses can call emit() themselves.
 */
export async function emit(db: PrismaClient, trigger: TriggerKey, subjectId: string, info: EventInfo = {}): Promise<void> {
  try {
    const { fireEvent } = await import("./engine");
    await fireEvent(db, trigger, subjectId, info);
  } catch (e) {
    console.error(`Workflow event ${trigger} failed`, e);
  }
}
