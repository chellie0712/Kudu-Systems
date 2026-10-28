"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/form";
import { fromLocalInput } from "@/lib/format";
import { deleteGoogleEvent, pullFromGoogle, pushEvent } from "@/lib/google";

function back(fd: FormData, fallback: string) {
  const to = str(fd, "returnTo");
  return to.startsWith("/") ? to : fallback;
}

function withMsg(path: string, params: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${params}`;
}

export async function saveEvent(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const allDay = str(fd, "allDay") === "on";
  let start: Date | null;
  let end: Date | null;
  if (allDay) {
    // All-day events are stored at UTC midnight; end is exclusive (as Google does).
    const d = str(fd, "date") || str(fd, "start").slice(0, 10);
    const endDay = str(fd, "endDate") || d;
    start = new Date(`${d}T00:00:00Z`);
    end = new Date(new Date(`${endDay}T00:00:00Z`).getTime() + 86400000);
  } else {
    start = fromLocalInput(str(fd, "start"));
    end = fromLocalInput(str(fd, "end"));
  }
  if (!start) throw new Error("Start is required");
  if (!end || end <= start) end = new Date(start.getTime() + 3600000);

  const data = {
    title: str(fd, "title") || "(no title)",
    description: str(fd, "description"),
    location: str(fd, "location"),
    start,
    end,
    allDay,
    customerId: str(fd, "customerId") || null,
  };
  const ev = id
    ? await db.calendarEvent.update({ where: { id }, data })
    : await db.calendarEvent.create({ data });
  const err = await pushEvent(ev.id);
  revalidatePath("/calendar");
  const to = back(fd, "/calendar");
  redirect(withMsg(to, err ? `err=${encodeURIComponent("Saved in Kudu, but Google Calendar failed: " + err)}` : "msg=Event+saved"));
}

export async function deleteEvent(fd: FormData) {
  await requireUser();
  const ev = await db.calendarEvent.delete({ where: { id: str(fd, "id") } });
  await deleteGoogleEvent(ev.googleEventId, ev.googleCalendarId);
  revalidatePath("/calendar");
  redirect(withMsg(back(fd, "/calendar"), "msg=Event+deleted"));
}

export async function syncNow(fd: FormData) {
  await requireUser();
  const to = back(fd, "/calendar");
  let message: string;
  try {
    // Push Kudu events that have never reached Google, then pull Google's changes.
    const unsynced = await db.calendarEvent.findMany({ where: { googleEventId: null }, select: { id: true } });
    for (const e of unsynced) await pushEvent(e.id);
    const s = await pullFromGoogle();
    message = `msg=${encodeURIComponent(`Synced with Google: ${unsynced.length} sent, ${s.imported} new, ${s.updated} updated, ${s.deleted} removed`)}`;
  } catch (e) {
    message = `err=${encodeURIComponent(e instanceof Error ? e.message : "Sync failed")}`;
  }
  revalidatePath("/calendar");
  redirect(withMsg(to, message));
}
