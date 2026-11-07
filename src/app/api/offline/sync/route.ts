import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { offlineAccess } from "@/lib/offlineServer";
import { parseItems } from "@/lib/checklists";
import { applySignOff, signOffProblems } from "@/lib/signoff";
import type { SyncResult } from "@/lib/offline";

const item = z.object({ label: z.string(), done: z.boolean(), note: z.string().max(500).default("") });
const body = z.object({
  jobId: z.string().min(1),
  areaTreated: z.string().max(2000),
  workDescription: z.string().max(10000),
  warrantyComments: z.string().max(5000),
  checklists: z.array(z.object({ id: z.string(), items: z.array(item).max(200) })).max(50),
  signOff: z
    .object({
      name: z.string().max(200),
      confirmed: z.boolean(),
      signature: z.string().max(2_000_000),
      rating: z.number().int().min(1).max(5).nullable(),
      feedback: z.string().max(2000),
      signedAt: z.string(),
    })
    .nullable(),
});

const reply = (r: SyncResult, status = 200) => NextResponse.json(r, { status });

/** Work a technician did offline: the job card's text, checklist ticks and, if given, the client's sign-off. */
export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return reply({ ok: false, completed: false, message: "The saved work could not be read." }, 400);
  const d = parsed.data;
  const access = await offlineAccess(d.jobId);
  if ("error" in access) return reply({ ok: false, completed: false, message: access.error }, access.status);
  const { db, jc } = access;

  if (jc.status === "CANCELLED") return reply({ ok: false, completed: false, message: `${jc.number} was cancelled by the office, so this work was not saved. Please call the office.` }, 409);
  if (jc.status === "COMPLETED") {
    return reply({ ok: true, completed: true, message: `${jc.number} was already completed online; the work saved on this phone was not applied.` });
  }

  // Tick the checklist items the technician ticked; items are matched by their wording, so a list
  // the office changed in the meantime keeps its new items.
  const lists = await db.jobCardChecklist.findMany({ where: { jobCardId: jc.id } });
  const updates = lists.flatMap((l) => {
    const sent = d.checklists.find((c) => c.id === l.id);
    if (!sent) return [];
    const items = parseItems(l.items).map((it) => {
      const s = sent.items.find((x) => x.label === it.label);
      return s ? { ...it, done: s.done, note: s.note } : it;
    });
    return [db.jobCardChecklist.update({ where: { id: l.id }, data: { items } })];
  });
  await db.$transaction([
    ...updates,
    db.jobCard.update({
      where: { id: jc.id },
      data: {
        areaTreated: d.areaTreated,
        workDescription: d.workDescription,
        warrantyComments: d.warrantyComments,
        ...(jc.status === "SCHEDULED" ? { status: "IN_PROGRESS", statusId: null } : {}),
      },
    }),
  ]);

  let result: SyncResult = { ok: true, completed: false, message: `${jc.number} saved.` };
  if (d.signOff) {
    const input = { name: d.signOff.name, signature: d.signOff.signature, confirmed: d.signOff.confirmed, rating: d.signOff.rating, feedback: d.signOff.feedback };
    const fresh = await db.jobCard.findUniqueOrThrow({ where: { id: jc.id } });
    const problems = await signOffProblems(db, fresh, input);
    if (problems.length) {
      result = { ok: true, completed: false, message: `${jc.number} saved, but not completed: ${problems.join(", ")}.` };
    } else {
      // Keep the time the client actually signed, if it is believable.
      const at = new Date(d.signOff.signedAt);
      const signedAt = Number.isNaN(at.getTime()) || at > new Date() || at < new Date(Date.now() - 30 * 86400000) ? new Date() : at;
      await applySignOff(db, fresh, input, signedAt);
      result = { ok: true, completed: true, message: `${jc.number} signed off and completed.` };
    }
  }
  revalidatePath("/job-cards");
  revalidatePath(`/job-cards/${jc.id}`);
  revalidatePath("/");
  return reply(result);
}
