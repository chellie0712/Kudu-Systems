"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { JobCardStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { optDate, parseJson, str } from "@/lib/form";
import { getSettings, nextNumber } from "@/lib/settings";
import { addDays } from "@/lib/format";
import { deleteGoogleEvent, pushEvent } from "@/lib/google";
import type { PhotoRef } from "@/components/JobCardEditors";

/** Keep one calendar event per scheduled job card, mirrored to Google. */
async function syncJobCardEvent(jobCardId: string): Promise<string | null> {
  const jc = await db.jobCard.findUniqueOrThrow({ where: { id: jobCardId }, include: { customer: true } });
  const existing = await db.calendarEvent.findFirst({ where: { jobCardId } });

  if (!jc.scheduledStart || jc.status === JobCardStatus.CANCELLED) {
    if (existing) {
      await deleteGoogleEvent(existing.googleEventId, existing.googleCalendarId);
      await db.calendarEvent.delete({ where: { id: existing.id } });
    }
    return null;
  }
  const end = jc.scheduledEnd && jc.scheduledEnd > jc.scheduledStart ? jc.scheduledEnd : new Date(jc.scheduledStart.getTime() + 3600000);
  const data = {
    title: `${jc.number} · ${jc.customer.name}${jc.jobType ? ` · ${jc.jobType}` : ""}`,
    description: [
      jc.technician && `Technician: ${jc.technician}`,
      jc.siteContact && `Site contact: ${jc.siteContact} ${jc.contactNumber}`,
      jc.scopeOfWork && `\nScope:\n${jc.scopeOfWork}`,
    ]
      .filter(Boolean)
      .join("\n"),
    location: jc.siteAddress,
    start: jc.scheduledStart,
    end,
    allDay: false,
    customerId: jc.customerId,
    jobCardId: jc.id,
  };
  const ev = existing
    ? await db.calendarEvent.update({ where: { id: existing.id }, data })
    : await db.calendarEvent.create({ data });
  return pushEvent(ev.id);
}

export async function saveJobCard(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const photos = parseJson<PhotoRef[]>(fd, "photos", []).filter((p) => p && typeof p.id === "string");
  const customerSignature = str(fd, "customerSignature") || null;

  const data = {
    customerId: str(fd, "customerId"),
    status: (str(fd, "status") as JobCardStatus) || JobCardStatus.SCHEDULED,
    jobDate: optDate(fd, "jobDate"),
    technician: str(fd, "technician"),
    jobType: str(fd, "jobType"),
    priority: str(fd, "priority") || "Normal",
    scheduledStart: optDate(fd, "scheduledStart"),
    scheduledEnd: optDate(fd, "scheduledEnd"),
    scopeOfWork: str(fd, "scopeOfWork"),
    contactNumber: str(fd, "contactNumber"),
    siteContact: str(fd, "siteContact"),
    siteAddress: str(fd, "siteAddress"),
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
  if (!data.customerId) throw new Error("Choose a customer");

  let jcId = id;
  if (id) {
    const before = await db.jobCard.findUniqueOrThrow({ where: { id }, select: { customerSignature: true, signedAt: true, number: true } });
    // Timestamp the signature when it is first given or re-signed.
    const signedAt = customerSignature ? (customerSignature !== before.customerSignature ? new Date() : before.signedAt) : null;
    await db.jobCard.update({ where: { id }, data: { ...data, warrantyNo: data.warrantyNo || before.number, signedAt } });
  } else {
    const number = await nextNumber("jobCard");
    const jc = await db.jobCard.create({
      data: {
        ...data,
        number,
        warrantyNo: data.warrantyNo || number,
        quotationId: str(fd, "quotationId") || null,
        signedAt: customerSignature ? new Date() : null,
      },
    });
    jcId = jc.id;
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

  const calendarError = await syncJobCardEvent(jcId);
  revalidatePath("/job-cards");
  revalidatePath("/calendar");
  const msg = calendarError ? `&err=${encodeURIComponent("Saved, but Google Calendar was not updated: " + calendarError)}` : "";
  redirect(`/job-cards/${jcId}?msg=Job+card+saved${msg}`);
}

export async function setJobCardStatus(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const status = str(fd, "status") as JobCardStatus;
  await db.jobCard.update({ where: { id }, data: { status } });
  await syncJobCardEvent(id);
  revalidatePath(`/job-cards/${id}`);
  redirect(`/job-cards/${id}?msg=Status+updated`);
}

export async function deleteJobCard(fd: FormData) {
  await requireUser();
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

/** Invoice from a job card: copies the linked quotation's lines when there is one. */
export async function createInvoiceFromJobCard(fd: FormData) {
  await requireUser();
  const settings = await getSettings();
  const jc = await db.jobCard.findUniqueOrThrow({
    where: { id: str(fd, "id") },
    include: { quotation: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
  });
  const q = jc.quotation;
  const now = new Date();
  const inv = await db.invoice.create({
    data: {
      number: await nextNumber("invoice"),
      customerId: jc.customerId,
      jobCardId: jc.id,
      quotationId: q?.id ?? null,
      issueDate: now,
      dueDate: addDays(now, settings.invoiceDueDays),
      reference: [q?.number, jc.number].filter(Boolean).join(" / "),
      terms: settings.invoiceTerms,
      vatRate: q?.vatRate ?? settings.vatRate,
      discount: q?.discount ?? 0,
      subtotal: q?.subtotal ?? 0,
      vatAmount: q?.vatAmount ?? 0,
      total: q?.total ?? 0,
      items: q
        ? {
            create: q.items.map((i) => ({
              description: i.description,
              quantity: i.quantity,
              unit: i.unit,
              unitPrice: i.unitPrice,
              sortOrder: i.sortOrder,
            })),
          }
        : undefined,
    },
  });
  revalidatePath("/invoices");
  redirect(q ? `/invoices/${inv.id}?msg=Invoice+created+from+${jc.number}` : `/invoices/${inv.id}/edit?msg=Invoice+created.+Add+the+line+items.`);
}
