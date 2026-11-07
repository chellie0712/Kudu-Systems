"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { QueryPriority, QueryStatus, type Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { optDate, str } from "@/lib/form";
import { fmtDate } from "@/lib/format";
import { nextNumber } from "@/lib/settings";
import { PRIORITY_LABELS, QUERY_STATUS_LABELS } from "@/lib/queries";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const priorityFrom = (fd: FormData) => {
  const p = str(fd, "priority");
  return p in QueryPriority ? (p as QueryPriority) : QueryPriority.NORMAL;
};

/** Staff only can be assigned a query (technicians can't open the queries pages). */
async function staffUserId(db: Awaited<ReturnType<typeof tenantDb>>, id: string): Promise<string | null> {
  if (!id) return null;
  const u = await db.user.findFirst({ where: { id, disabled: false, role: { in: ["ADMIN", "OFFICE"] } }, select: { id: true } });
  return u?.id ?? null;
}

export async function createQuery(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("queries.edit");
  const customerId = str(fd, "customerId");
  const subject = str(fd, "subject");
  const back = `/queries/new${customerId ? `?customerId=${customerId}` : ""}`;
  if (!customerId || !subject) go(back, "err", "Choose the customer and enter a subject.");
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) go(back, "err", "Customer not found.");
  const jobCardId = str(fd, "jobCardId");
  const jobCard = jobCardId ? await db.jobCard.findFirst({ where: { id: jobCardId, customerId }, select: { id: true } }) : null;
  const assignedToId = await staffUserId(db, str(fd, "assignedToId"));
  const q = await db.query.create({
    data: {
      number: await nextNumber("query"),
      customerId,
      subject,
      description: str(fd, "description"),
      category: str(fd, "category"),
      source: str(fd, "source"),
      priority: priorityFrom(fd),
      assignedToId,
      dueAt: optDate(fd, "dueAt"),
      jobCardId: jobCard?.id ?? null,
      createdBy: user.name,
      notes: { create: { text: "Query logged", system: true, userName: user.name } },
    },
  });
  revalidatePath("/queries");
  redirect(`/queries/${q.id}?msg=Query+${q.number}+logged`);
}

/** Edits the details; changes to priority, assignment and due date are written to the timeline. */
export async function updateQuery(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("queries.edit");
  const id = str(fd, "id");
  const q = await db.query.findUnique({ where: { id }, include: { assignedTo: { select: { name: true, email: true } } } });
  if (!q) redirect("/queries");
  const path = `/queries/${id}`;
  const subject = str(fd, "subject");
  if (!subject) go(path, "err", "The query needs a subject.");
  const assignedToId = await staffUserId(db, str(fd, "assignedToId"));
  const priority = priorityFrom(fd);
  const dueAt = optDate(fd, "dueAt");

  const log: string[] = [];
  if (priority !== q.priority) log.push(`Priority: ${PRIORITY_LABELS[q.priority]} → ${PRIORITY_LABELS[priority]}`);
  if (assignedToId !== q.assignedToId) {
    const to = assignedToId ? await db.user.findUnique({ where: { id: assignedToId }, select: { name: true, email: true } }) : null;
    log.push(`Assigned to ${to ? to.name || to.email : "nobody"}`);
  }
  if ((dueAt?.getTime() ?? null) !== (q.dueAt?.getTime() ?? null)) log.push(dueAt ? `Due ${fmtDate(dueAt)}` : "Due date removed");

  await db.query.update({
    where: { id },
    data: {
      subject,
      description: str(fd, "description"),
      category: str(fd, "category"),
      source: str(fd, "source"),
      priority,
      assignedToId,
      dueAt,
      ...(log.length ? { notes: { create: log.map((text) => ({ text, system: true, userName: user.name })) } } : {}),
    },
  });
  revalidatePath(path);
  go(path, "msg", "Query saved");
}

export async function setQueryStatus(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("queries.edit");
  const id = str(fd, "id");
  const q = await db.query.findUnique({ where: { id } });
  if (!q) redirect("/queries");
  const path = `/queries/${id}`;
  const raw = str(fd, "status");
  if (!(raw in QueryStatus)) go(path, "err", "Unknown status.");
  const status = raw as QueryStatus;
  const resolution = str(fd, "resolution");
  const closing = status === "RESOLVED" || status === "CLOSED";
  if (closing && !resolution && !q.resolution) go(path, "err", "Say how the query was resolved before closing it.");
  if (status === q.status && !resolution) go(path, "msg", "Nothing changed.");

  const notes: Prisma.QueryNoteCreateWithoutQueryInput[] = [];
  if (status !== q.status) notes.push({ text: `Status: ${QUERY_STATUS_LABELS[q.status]} → ${QUERY_STATUS_LABELS[status]}`, system: true, userName: user.name });
  if (resolution && resolution !== q.resolution) notes.push({ text: `Resolution: ${resolution}`, system: true, userName: user.name });
  await db.query.update({
    where: { id },
    data: {
      status,
      ...(resolution ? { resolution } : {}),
      resolvedAt: closing ? (q.resolvedAt ?? new Date()) : null,
      notes: { create: notes },
    },
  });
  revalidatePath(path);
  revalidatePath("/queries");
  go(path, "msg", closing ? "Query resolved" : `Status set to ${QUERY_STATUS_LABELS[status]}`);
}

export async function addQueryNote(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("queries.edit");
  const id = str(fd, "id");
  const text = str(fd, "text");
  const path = `/queries/${id}`;
  if (!text) go(path, "err", "Write a note first.");
  await db.queryNote.create({ data: { queryId: id, text, userName: user.name } });
  // A note on a fresh query means someone is working on it.
  await db.query.updateMany({ where: { id, status: "OPEN" }, data: { status: "IN_PROGRESS" } });
  revalidatePath(path);
  go(path, "msg", "Note added");
}

/** Raises a job card for the query (e.g. a re-service visit) and links it. */
export async function createJobCardFromQuery(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("jobcards.create");
  await requirePermission("queries.edit");
  const q = await db.query.findUnique({ where: { id: str(fd, "id") }, include: { customer: true, jobCard: { select: { number: true } } } });
  if (!q) redirect("/queries");
  const jc = await db.jobCard.create({
    data: {
      number: await nextNumber("jobCard"),
      customerId: q.customerId,
      siteAddress: q.customer.siteAddress || q.customer.billingAddress,
      siteContact: q.customer.contactPerson || (q.customer.type === "INDIVIDUAL" ? q.customer.name : ""),
      contactNumber: q.customer.phone,
      jobType: q.category === "Re-service request" ? "Re-service" : "",
      scopeOfWork: [`Query ${q.number}: ${q.subject}`, q.jobCard && `Follow-up to job card ${q.jobCard.number}`, q.description].filter(Boolean).join("\n"),
    },
  });
  await db.query.update({
    where: { id: q.id },
    data: {
      jobCardId: jc.id,
      ...(q.status === "OPEN" ? { status: "IN_PROGRESS" } : {}),
      notes: { create: { text: `Job card ${jc.number} created`, system: true, userName: user.name } },
    },
  });
  revalidatePath("/job-cards");
  redirect(`/job-cards/${jc.id}/edit?msg=Job+card+created+from+query+${q.number}.+Set+the+date+and+technician.`);
}

export async function deleteQuery(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("queries.delete");
  const q = await db.query.findUnique({ where: { id: str(fd, "id") }, select: { id: true, number: true } });
  if (!q) redirect("/queries");
  await db.query.delete({ where: { id: q.id } });
  revalidatePath("/queries");
  go("/queries", "msg", `Query ${q.number} deleted`);
}
