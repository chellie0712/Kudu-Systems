"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission, type AppUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { fromLocalInput } from "@/lib/format";
import { can, canAccessJobCard } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { computeTotals } from "@/lib/totals";
import { labourLines, unbilled } from "@/lib/labour";

const back = (jobCardId: string, kind: "msg" | "err", text: string): never =>
  redirect(`/job-cards/${jobCardId}?${kind}=${encodeURIComponent(text)}#time`);

/** The job card, if this user may record time on it. */
async function jobFor(user: AppUser, jobCardId: string) {
  const db = await tenantDb();
  const jc = await db.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, technicianId: true } });
  if (!jc) redirect("/job-cards?msg=Job+card+not+found");
  if (!canAccessJobCard(user, jc)) redirect("/no-access?need=jobcards.viewAll");
  return jc;
}

export async function startTimer(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("time.track");
  const jc = await jobFor(user, str(fd, "jobCardId"));
  // One running timer per person: starting here stops any other.
  const now = new Date();
  await db.timeEntry.updateMany({ where: { userId: user.id, end: null }, data: { end: now } });
  await db.timeEntry.create({ data: { jobCardId: jc.id, userId: user.id, userName: user.name, start: now } });
  revalidatePath(`/job-cards/${jc.id}`);
  back(jc.id, "msg", "Timer started");
}

export async function stopTimer(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("time.track");
  const id = str(fd, "id");
  const entry = await db.timeEntry.findUnique({ where: { id } });
  if (!entry || entry.end) redirect("/job-cards?msg=Timer+already+stopped");
  if (entry.userId !== user.id && !can(user.role, "time.manageAll")) back(entry.jobCardId, "err", "You can only stop your own timer.");
  await db.timeEntry.update({ where: { id }, data: { end: new Date(), note: str(fd, "note") || entry.note } });
  revalidatePath(`/job-cards/${entry.jobCardId}`);
  back(entry.jobCardId, "msg", "Timer stopped");
}

/** Time added by hand: a date with start and end times. */
export async function addTimeEntry(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("time.track");
  const jc = await jobFor(user, str(fd, "jobCardId"));
  const date = str(fd, "date");
  const start = fromLocalInput(`${date}T${str(fd, "startTime")}`);
  const end = fromLocalInput(`${date}T${str(fd, "endTime")}`);
  if (!start || !end || end <= start) back(jc.id, "err", "Enter a date, a start time and a later end time.");
  // Office staff may record time for someone else; technicians only for themselves.
  let who = { id: user.id, name: user.name };
  const forUser = str(fd, "userId");
  if (forUser && forUser !== user.id) {
    if (!can(user.role, "time.manageAll")) back(jc.id, "err", "You can only record your own time.");
    const u = await db.user.findUnique({ where: { id: forUser } });
    if (!u) back(jc.id, "err", "User not found.");
    who = { id: u!.id, name: u!.name || u!.email || "" };
  }
  await db.timeEntry.create({
    data: {
      jobCardId: jc.id,
      userId: who.id,
      userName: who.name,
      start: start!,
      end: end!,
      note: str(fd, "note"),
      billable: can(user.role, "time.manageAll") ? fd.get("billable") === "on" : true,
    },
  });
  revalidatePath(`/job-cards/${jc.id}`);
  back(jc.id, "msg", "Time added");
}

export async function deleteTimeEntry(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("time.track");
  const entry = await db.timeEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!entry) redirect("/job-cards");
  if (entry.userId !== user.id && !can(user.role, "time.manageAll")) back(entry.jobCardId, "err", "You can only delete your own time.");
  if (entry.invoiceId) back(entry.jobCardId, "err", "This time is already on an invoice. Remove it from the invoice first.");
  await db.timeEntry.delete({ where: { id: entry.id } });
  revalidatePath(`/job-cards/${entry.jobCardId}`);
  back(entry.jobCardId, "msg", "Time entry deleted");
}

export async function setTimeBillable(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("time.manageAll");
  const entry = await db.timeEntry.findUnique({ where: { id: str(fd, "id") } });
  if (!entry) redirect("/job-cards");
  if (entry.invoiceId) back(entry.jobCardId, "err", "This time is already on an invoice.");
  await db.timeEntry.update({ where: { id: entry.id }, data: { billable: str(fd, "billable") === "true" } });
  back(entry.jobCardId, "msg", "Time entry updated");
}

/**
 * Adds the job card's unbilled time to its newest draft invoice as labour lines,
 * and marks that time as billed.
 */
export async function billLabourToDraft(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("labour.bill");
  const jobCardId = str(fd, "jobCardId");
  const invoice = await db.invoice.findFirst({
    where: { jobCardId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!invoice) back(jobCardId, "err", "There is no draft invoice for this job card. Use “Create invoice”, which includes the labour.");
  const [entries, settings] = await Promise.all([db.timeEntry.findMany({ where: { jobCardId } }), getSettings()]);
  const open = unbilled(entries);
  if (!open.length) back(jobCardId, "err", "There is no unbilled time on this job card.");
  const users = await db.user.findMany({ where: { id: { in: open.map((e) => e.userId).filter((x): x is string => !!x) } }, select: { id: true, labourRate: true } });
  const lines = labourLines(open, users, settings);
  const inv = invoice!;
  const items = [...inv.items, ...lines];
  const totals = computeTotals(items, inv.vatRate, inv.discount);
  await db.$transaction([
    db.invoiceItem.createMany({ data: lines.map((l, i) => ({ ...l, invoiceId: inv.id, sortOrder: inv.items.length + i })) }),
    db.invoice.update({ where: { id: inv.id }, data: totals }),
    db.timeEntry.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { invoiceId: inv.id } }),
  ]);
  revalidatePath(`/invoices/${inv.id}`);
  redirect(`/invoices/${inv.id}?msg=${encodeURIComponent(`Labour added from the job card (${lines.length} line${lines.length === 1 ? "" : "s"})`)}`);
}
