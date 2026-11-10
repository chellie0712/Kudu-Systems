"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { JobCardStatus } from "@prisma/client";
import { requirePermission, type AppUser } from "@/auth";
import { can, canAccessJobCard } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { optDate, parseJson, str } from "@/lib/form";
import { getSettings, nextNumber } from "@/lib/settings";
import { addDays } from "@/lib/format";
import { contactForDoc } from "@/lib/contacts";
import { logStatusChange } from "@/lib/statusLog";
import { syncJobCardEvent } from "@/lib/jobCardCalendar";
import { applySignOff, signOffProblems } from "@/lib/signoff";
import { deleteGoogleEvent } from "@/lib/google";
import type { PhotoRef } from "@/components/JobCardEditors";
import { CUSTOM_PREFIX } from "@/lib/jobStatus";
import { labourLines, unbilled } from "@/lib/labour";
import { computeTotals } from "@/lib/totals";
import { autoApplies, incompleteRequired, itemsFromTemplate, parseChecklists, parseItems, type ChecklistInput } from "@/lib/checklists";

/** A status value from a form: a stage ("COMPLETED") or a custom status ("custom:<id>"). */
async function resolveStatus(raw: string): Promise<{ status: JobCardStatus; statusId: string | null } | null> {
  if (raw.startsWith(CUSTOM_PREFIX)) {
    const db = await tenantDb();
    const custom = await db.jobStatus.findUnique({ where: { id: raw.slice(CUSTOM_PREFIX.length) } });
    return custom ? { status: custom.stage, statusId: custom.id } : null;
  }
  return raw in JobCardStatus ? { status: raw as JobCardStatus, statusId: null } : null;
}

/** The job card's checklists, with every automatic checklist for its job type present. */
async function withAutoChecklists(lists: ChecklistInput[], jobType: string): Promise<ChecklistInput[]> {
  const db = await tenantDb();
  const templates = await db.checklistTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const known = new Set(templates.map((t) => t.id));
  // Drop links to templates that no longer exist; the checklist itself is kept.
  const result = lists.map((l) => ({ ...l, templateId: l.templateId && known.has(l.templateId) ? l.templateId : null }));
  for (const t of templates) {
    if (autoApplies(t, jobType) && !result.some((l) => l.templateId === t.id)) {
      result.push({ templateId: t.id, name: t.name, requiredForCompletion: t.requiredForCompletion, items: itemsFromTemplate(t.items) });
    }
  }
  return result;
}

/** Loads a job card the user may work on, or sends them to /no-access. */
async function jobCardFor(user: AppUser, id: string) {
  const db = await tenantDb();
  const jc = await db.jobCard.findUnique({ where: { id } });
  if (!jc) redirect("/job-cards?msg=Job+card+not+found");
  if (!canAccessJobCard(user, jc)) redirect("/no-access?need=jobcards.viewAll");
  return jc;
}

/** The technician name printed on the card: what was typed, else the assigned user's name. */
async function technicianName(technicianId: string | null, typed: string): Promise<string> {
  if (typed || !technicianId) return typed;
  const db = await tenantDb();
  const u = await db.user.findUnique({ where: { id: technicianId }, select: { name: true, email: true } });
  return u?.name || u?.email || "";
}

export async function saveJobCard(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("jobcards.edit");
  const id = str(fd, "id");
  if (!id && !can(user, "jobcards.create")) redirect("/no-access?need=jobcards.create");
  const before = id ? await jobCardFor(user, id) : null;
  const canAssign = can(user, "jobcards.assign");
  const photos = parseJson<PhotoRef[]>(fd, "photos", []).filter((p) => p && typeof p.id === "string");
  const customerSignature = str(fd, "customerSignature") || null;

  const keepStatus = { status: before?.status ?? JobCardStatus.SCHEDULED, statusId: before?.statusId ?? null };
  let chosen = (await resolveStatus(str(fd, "status"))) ?? keepStatus;
  // Only the office can cancel a job.
  if (!canAssign && chosen.status === JobCardStatus.CANCELLED) chosen = keepStatus;

  // Who does the job, for whom and when: set by the office. Technicians cannot change these.
  const technicianId = str(fd, "technicianId") || null;
  const assignment = canAssign
    ? {
        customerId: str(fd, "customerId"),
        contactId: await contactForDoc(db, str(fd, "customerId"), str(fd, "contactId")),
        technicianId,
        technician: await technicianName(technicianId, str(fd, "technician")),
        jobType: str(fd, "jobType"),
        priority: str(fd, "priority") || "Normal",
        scheduledStart: optDate(fd, "scheduledStart"),
        scheduledEnd: optDate(fd, "scheduledEnd"),
        scopeOfWork: str(fd, "scopeOfWork"),
        contactNumber: str(fd, "contactNumber"),
        siteContact: str(fd, "siteContact"),
        siteAddress: str(fd, "siteAddress"),
      }
    : {};

  const checklists = await withAutoChecklists(parseChecklists(str(fd, "checklists")), assignment.jobType ?? before?.jobType ?? "");
  // A job can only be completed once its required checklists are fully ticked.
  const unfinished = incompleteRequired(checklists);
  let notice = "";
  if (chosen.status === JobCardStatus.COMPLETED && unfinished.length) {
    chosen = keepStatus.status === JobCardStatus.COMPLETED ? { status: JobCardStatus.IN_PROGRESS, statusId: null } : keepStatus;
    notice = `Saved, but not marked completed: finish the ${unfinished.join(", ")} checklist first.`;
  }

  const data = {
    ...assignment,
    ...chosen,
    jobDate: optDate(fd, "jobDate"),
    areaTreated: str(fd, "areaTreated"),
    workDescription: str(fd, "workDescription"),
    warrantyNo: str(fd, "warrantyNo"),
    warrantyStart: optDate(fd, "warrantyStart"),
    warrantyEnd: optDate(fd, "warrantyEnd"),
    warrantyCovers: fd.getAll("warrantyCovers").map(String),
    activeIngredients: fd.getAll("activeIngredients").map(String),
    activeIngredientOther: str(fd, "activeIngredientOther"),
    warrantyComments: str(fd, "warrantyComments"),
    clientConfirmed: fd.get("clientConfirmed") === "on",
    customerSignName: str(fd, "customerSignName"),
    customerSignature,
  };

  let jcId = id;
  if (before) {
    // Timestamp the signature when it is first given or re-signed.
    const signedAt = customerSignature ? (customerSignature !== before.customerSignature ? new Date() : before.signedAt) : null;
    if (canAssign && !assignment.customerId) throw new Error("Choose a customer");
    await db.jobCard.update({ where: { id }, data: { ...data, warrantyNo: data.warrantyNo || before.number, signedAt } });
    await logStatusChange(db, id, before, chosen, user.name);
  } else {
    if (!assignment.customerId) throw new Error("Choose a customer");
    const number = await nextNumber("jobCard");
    const jc = await db.jobCard.create({
      data: {
        ...data,
        customerId: assignment.customerId,
        number,
        warrantyNo: data.warrantyNo || number,
        quotationId: str(fd, "quotationId") || null,
        signedAt: customerSignature ? new Date() : null,
      },
    });
    jcId = jc.id;
    await logStatusChange(db, jc.id, null, chosen, user.name);
  }

  // Attach the photos kept in the form, drop the ones removed, and clear day-old orphans.
  const keep = photos.map((p) => p.id);
  await db.$transaction([
    db.jobCardPhoto.deleteMany({ where: { jobCardId: jcId, id: { notIn: keep } } }),
    ...photos.map((p, i) =>
      db.jobCardPhoto.updateMany({ where: { id: p.id, OR: [{ jobCardId: null }, { jobCardId: jcId }] }, data: { jobCardId: jcId, sortOrder: i } }),
    ),
    db.jobCardPhoto.deleteMany({ where: { jobCardId: null, createdAt: { lt: new Date(Date.now() - 86400000) } } }),
  ]);

  // Replace the job card's checklists with what was submitted.
  await db.$transaction([
    db.jobCardChecklist.deleteMany({ where: { jobCardId: jcId } }),
    db.jobCardChecklist.createMany({
      data: checklists.map((l, i) => ({
        jobCardId: jcId,
        templateId: l.templateId,
        name: l.name,
        requiredForCompletion: l.requiredForCompletion,
        items: l.items,
        sortOrder: i,
      })),
    }),
  ]);

  const calendarError = await syncJobCardEvent(jcId);
  revalidatePath("/job-cards");
  revalidatePath("/calendar");
  const errors = [notice, calendarError && `Google Calendar was not updated: ${calendarError}`].filter(Boolean).join(" ");
  const msg = errors ? `&err=${encodeURIComponent(errors)}` : "";
  redirect(`/job-cards/${jcId}?msg=Job+card+saved${msg}`);
}

export async function setJobCardStatus(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("jobcards.edit");
  const id = str(fd, "id");
  const before = await jobCardFor(user, id);
  const chosen = await resolveStatus(str(fd, "status"));
  if (!chosen) redirect(`/job-cards/${id}?err=Unknown+status`);
  if (chosen.status === JobCardStatus.CANCELLED && !can(user, "jobcards.assign")) redirect(`/job-cards/${id}?err=Only+the+office+can+cancel+a+job`);
  if (chosen.status === JobCardStatus.COMPLETED) {
    const lists = await db.jobCardChecklist.findMany({ where: { jobCardId: id } });
    const unfinished = incompleteRequired(lists.map((l) => ({ ...l, items: parseItems(l.items) })));
    if (unfinished.length) redirect(`/job-cards/${id}?err=${encodeURIComponent(`Finish the ${unfinished.join(", ")} checklist before completing this job.`)}`);
  }
  await db.jobCard.update({ where: { id }, data: chosen });
  await logStatusChange(db, id, before, chosen, user.name);
  await syncJobCardEvent(id);
  revalidatePath(`/job-cards/${id}`);
  redirect(`/job-cards/${id}?msg=Status+updated`);
}

export async function deleteJobCard(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("jobcards.delete");
  const id = str(fd, "id");
  const events = await db.calendarEvent.findMany({ where: { jobCardId: id } });
  for (const ev of events) {
    await deleteGoogleEvent(ev.googleEventId, ev.googleCalendarId);
    await db.calendarEvent.delete({ where: { id: ev.id } });
  }
  const jc = await db.jobCard.delete({ where: { id } });
  revalidatePath("/job-cards");
  redirect(`/customers/${jc.customerId}?tab=jobcards&msg=Job+card+deleted`);
}

/** Invoice from a job card: copies the linked quotation's lines when there is one, and adds unbilled labour. */
export async function createInvoiceFromJobCard(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("invoices.edit");
  const settings = await getSettings();
  const jc = await db.jobCard.findUniqueOrThrow({
    where: { id: str(fd, "id") },
    include: { quotation: { include: { items: { orderBy: { sortOrder: "asc" } } } }, timeEntries: true },
  });
  const q = jc.quotation;
  const open = unbilled(jc.timeEntries);
  const users = await db.user.findMany({
    where: { id: { in: open.map((e) => e.userId).filter((x): x is string => !!x) } },
    select: { id: true, labourRate: true },
  });
  const labour = labourLines(open, users, settings);
  const items = [
    ...(q?.items ?? []).map((i) => ({ description: i.description, quantity: i.quantity, unit: i.unit, unitPrice: i.unitPrice })),
    ...labour,
  ];
  const vatRate = q?.vatRate ?? settings.vatRate;
  const discount = q?.discount ?? 0;
  const now = new Date();
  const inv = await db.invoice.create({
    data: {
      number: await nextNumber("invoice"),
      customerId: jc.customerId,
      contactId: jc.contactId ?? q?.contactId ?? (await contactForDoc(db, jc.customerId, "")),
      jobCardId: jc.id,
      quotationId: q?.id ?? null,
      issueDate: now,
      dueDate: addDays(now, settings.invoiceDueDays),
      reference: [q?.number, jc.number].filter(Boolean).join(" / "),
      terms: settings.invoiceTerms,
      vatRate,
      discount,
      ...computeTotals(items, vatRate, discount),
      items: items.length ? { create: items.map((i, n) => ({ ...i, sortOrder: n })) } : undefined,
    },
  });
  if (open.length) await db.timeEntry.updateMany({ where: { id: { in: open.map((e) => e.id) } }, data: { invoiceId: inv.id } });
  revalidatePath("/invoices");
  const labourNote = labour.length ? "+with+labour" : "";
  redirect(
    items.length
      ? `/invoices/${inv.id}?msg=Invoice+created+from+${jc.number}${labourNote}`
      : `/invoices/${inv.id}/edit?msg=Invoice+created.+Add+the+line+items.`,
  );
}

/**
 * The client signs off a job on the technician's phone: records the signature, confirmation, rating
 * and comment, marks the job completed and stops any timer still running on it.
 */
export async function signOffJobCard(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("jobcards.edit");
  const jc = await jobCardFor(user, str(fd, "id"));
  const path = `/sign/${jc.id}`;
  const input = {
    name: str(fd, "customerSignName"),
    signature: str(fd, "customerSignature"),
    confirmed: fd.get("clientConfirmed") === "on",
    rating: Number(str(fd, "rating")) || null,
    feedback: str(fd, "feedback"),
  };
  const missing = await signOffProblems(db, jc, input);
  if (missing.length) redirect(`${path}?err=${encodeURIComponent(`Before sign-off, please ${missing.join(", ")}.`)}`);
  await applySignOff(db, jc, input);
  revalidatePath("/job-cards");
  revalidatePath(`/job-cards/${jc.id}`);
  revalidatePath("/calendar");
  revalidatePath("/");
  redirect(`${path}?done=1`);
}
