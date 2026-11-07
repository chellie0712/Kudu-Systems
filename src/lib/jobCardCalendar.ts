import { JobCardStatus } from "@prisma/client";
import { tenantDb } from "@/lib/db";
import { deleteGoogleEvent, pushEvent } from "@/lib/google";

/** Keep one calendar event per scheduled job card, mirrored to Google. */
export async function syncJobCardEvent(jobCardId: string): Promise<string | null> {
  const db = await tenantDb();
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
