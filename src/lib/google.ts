import { google, calendar_v3 } from "googleapis";
import type { CalendarEvent } from "@prisma/client";
import { db } from "./db";
import { getSettings } from "./settings";
import { APP_TIMEZONE } from "./format";

export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/**
 * Calendar client acting as the Google account chosen in Settings.
 * Returns null when Google is not configured or no account is connected.
 */
export async function getCalendar(): Promise<{ cal: calendar_v3.Calendar; calendarId: string } | null> {
  if (!googleConfigured) return null;
  const settings = await getSettings();
  if (!settings.googleSyncUserId) return null;
  const account = await db.account.findFirst({
    where: { userId: settings.googleSyncUserId, provider: "google" },
  });
  if (!account?.refresh_token && !account?.access_token) return null;

  const oauth = new google.auth.OAuth2(process.env.AUTH_GOOGLE_ID, process.env.AUTH_GOOGLE_SECRET);
  oauth.setCredentials({
    access_token: account.access_token ?? undefined,
    refresh_token: account.refresh_token ?? undefined,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });
  // Persist refreshed tokens so the next request does not refresh again.
  oauth.on("tokens", async (tokens) => {
    await db.account.update({
      where: { id: account.id },
      data: {
        access_token: tokens.access_token ?? undefined,
        expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : undefined,
        ...(tokens.refresh_token ? { refresh_token: tokens.refresh_token } : {}),
      },
    });
  });
  return { cal: google.calendar({ version: "v3", auth: oauth }), calendarId: settings.googleCalendarId || "primary" };
}

function toGoogle(ev: CalendarEvent): calendar_v3.Schema$Event {
  const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
  return {
    summary: ev.title,
    description: ev.description,
    location: ev.location,
    start: ev.allDay ? { date: dateOnly(ev.start) } : { dateTime: ev.start.toISOString(), timeZone: APP_TIMEZONE },
    end: ev.allDay ? { date: dateOnly(ev.end) } : { dateTime: ev.end.toISOString(), timeZone: APP_TIMEZONE },
    extendedProperties: {
      private: {
        kuduEventId: ev.id,
        kuduCustomerId: ev.customerId ?? "",
        kuduJobCardId: ev.jobCardId ?? "",
      },
    },
  };
}

/** Create or update the Google copy of an event. Errors are returned, not thrown, so saving in Kudu never fails because of Google. */
export async function pushEvent(eventId: string): Promise<string | null> {
  try {
    const g = await getCalendar();
    if (!g) return null;
    const ev = await db.calendarEvent.findUniqueOrThrow({ where: { id: eventId } });
    const body = toGoogle(ev);
    const res = ev.googleEventId
      ? await g.cal.events.patch({ calendarId: g.calendarId, eventId: ev.googleEventId, requestBody: body })
      : await g.cal.events.insert({ calendarId: g.calendarId, requestBody: body });
    await db.calendarEvent.update({
      where: { id: ev.id },
      data: {
        googleEventId: res.data.id,
        googleCalendarId: g.calendarId,
        googleUpdatedAt: res.data.updated ? new Date(res.data.updated) : new Date(),
      },
    });
    return null;
  } catch (e) {
    console.error("Google push failed", e);
    return e instanceof Error ? e.message : "Google Calendar update failed";
  }
}

export async function deleteGoogleEvent(googleEventId: string | null, calendarId: string | null) {
  if (!googleEventId) return;
  try {
    const g = await getCalendar();
    if (!g) return;
    await g.cal.events.delete({ calendarId: calendarId || g.calendarId, eventId: googleEventId });
  } catch (e) {
    console.error("Google delete failed", e);
  }
}

function fromGoogleTime(t?: calendar_v3.Schema$EventDateTime): { date: Date; allDay: boolean } | null {
  if (t?.dateTime) return { date: new Date(t.dateTime), allDay: false };
  if (t?.date) return { date: new Date(`${t.date}T00:00:00Z`), allDay: true };
  return null;
}

/**
 * Pull changes from Google into Kudu. Uses an incremental sync token after the first run.
 * First run imports events from 90 days ago onwards.
 */
export async function pullFromGoogle(): Promise<{ imported: number; updated: number; deleted: number }> {
  const g = await getCalendar();
  if (!g) throw new Error("Google Calendar is not connected. Connect it in Settings.");
  const settings = await getSettings();
  const stats = { imported: 0, updated: 0, deleted: 0 };

  let syncToken = settings.googleSyncToken ?? undefined;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  for (;;) {
    let res;
    try {
      res = await g.cal.events.list({
        calendarId: g.calendarId,
        singleEvents: true,
        showDeleted: true,
        maxResults: 250,
        pageToken,
        ...(syncToken ? { syncToken } : { timeMin: new Date(Date.now() - 90 * 86400000).toISOString() }),
      });
    } catch (e: unknown) {
      // 410 = sync token expired; start a full sync.
      if ((e as { code?: number }).code === 410 && syncToken) {
        syncToken = undefined;
        pageToken = undefined;
        continue;
      }
      throw e;
    }

    for (const item of res.data.items ?? []) {
      if (!item.id) continue;
      const existing = await db.calendarEvent.findUnique({ where: { googleEventId: item.id } });
      if (item.status === "cancelled") {
        if (existing) {
          await db.calendarEvent.delete({ where: { id: existing.id } });
          stats.deleted++;
        }
        continue;
      }
      const start = fromGoogleTime(item.start);
      const end = fromGoogleTime(item.end);
      if (!start || !end) continue;

      const priv = item.extendedProperties?.private ?? {};
      let customerId = existing?.customerId ?? null;
      if (priv.kuduCustomerId) {
        const c = await db.customer.findUnique({ where: { id: priv.kuduCustomerId }, select: { id: true } });
        if (c) customerId = c.id;
      }
      const data = {
        title: item.summary || "(no title)",
        description: item.description ?? "",
        location: item.location ?? "",
        start: start.date,
        end: end.date,
        allDay: start.allDay,
        customerId,
        googleCalendarId: g.calendarId,
        googleUpdatedAt: item.updated ? new Date(item.updated) : new Date(),
      };
      if (existing) {
        await db.calendarEvent.update({ where: { id: existing.id }, data });
        stats.updated++;
      } else if (priv.kuduEventId && (await db.calendarEvent.findUnique({ where: { id: priv.kuduEventId } }))) {
        await db.calendarEvent.update({ where: { id: priv.kuduEventId }, data: { ...data, googleEventId: item.id } });
        stats.updated++;
      } else {
        await db.calendarEvent.create({ data: { ...data, googleEventId: item.id } });
        stats.imported++;
      }
    }

    if (res.data.nextPageToken) {
      pageToken = res.data.nextPageToken;
      continue;
    }
    nextSyncToken = res.data.nextSyncToken ?? undefined;
    break;
  }

  await db.settings.update({ where: { id: 1 }, data: { googleSyncToken: nextSyncToken ?? null } });
  return stats;
}
