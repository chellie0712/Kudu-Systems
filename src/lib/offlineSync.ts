"use client";

import type { OfflinePack, SyncResult } from "@/lib/offline";
import { deleteDraft, getDrafts, saveDraft, savePack } from "@/lib/offlineStore";

/** Fetches the signed-in user's open jobs and keeps them on the phone. */
export async function downloadJobs(): Promise<OfflinePack | null> {
  const res = await fetch("/api/offline/jobs", { cache: "no-store" });
  if (!res.ok) return null;
  const pack = (await res.json()) as OfflinePack;
  await savePack(pack);
  return pack;
}

export type SendReport = { sent: number; completed: number; messages: string[]; stopped?: string };

/**
 * Sends every job saved on the phone: photos one by one first, then the job card itself.
 * A job stays on the phone until the server has it; a sign-off the server could not accept
 * stays too, with the reason, so it can be fixed and sent again.
 */
export async function sendDrafts(userId?: string): Promise<SendReport> {
  const report: SendReport = { sent: 0, completed: 0, messages: [] };
  const drafts = (await getDrafts()).filter((d) => !userId || d.userId === userId);
  for (const draft of drafts) {
    try {
      for (const p of draft.photos.filter((p) => !p.sent)) {
        const r = await fetch("/api/offline/photo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: draft.jobId, ...p }) });
        if (r.status === 401) return { ...report, stopped: "You are signed out. Sign in to send your work." };
        if (!r.ok) {
          const e = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(e.error || `Photo not sent (${r.status})`);
        }
        const body = (await r.json().catch(() => ({}))) as { skipped?: string };
        if (body.skipped) report.messages.push(body.skipped);
        p.sent = true;
        await saveDraft(draft);
      }
      const { photos: _photos, error: _error, ...rest } = draft;
      void _photos;
      void _error;
      const r = await fetch("/api/offline/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rest) });
      if (r.status === 401) return { ...report, stopped: "You are signed out. Sign in to send your work." };
      const result = (await r.json().catch(() => ({ ok: false, completed: false, message: `Not sent (${r.status})` }))) as SyncResult;
      report.messages.push(result.message);
      if (result.ok && (result.completed || !draft.signOff)) {
        await deleteDraft(draft.jobId);
        report.sent++;
        if (result.completed) report.completed++;
      } else {
        await saveDraft({ ...draft, error: result.message });
        if (result.ok) report.sent++;
      }
    } catch (e) {
      if (e instanceof TypeError) return { ...report, stopped: "No connection. Your work is still saved on this phone." };
      await saveDraft({ ...draft, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return report;
}
