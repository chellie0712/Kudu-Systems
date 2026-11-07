"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDrafts } from "@/lib/offlineStore";
import { downloadJobs, sendDrafts } from "@/lib/offlineSync";

/**
 * On the technician's home page: sends work saved offline, then keeps a fresh copy of their
 * open jobs on the phone for when there is no signal.
 */
export function OfflineAgent() {
  const [state, setState] = useState<{ jobs: number; unsent: number; at: string; note: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const report = navigator.onLine ? await sendDrafts() : null;
        const pack = navigator.onLine && !report?.stopped ? await downloadJobs() : null;
        const unsent = (await getDrafts()).length;
        if (cancelled) return;
        setState({
          jobs: pack?.jobs.length ?? 0,
          unsent,
          at: pack ? new Date(pack.downloadedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "",
          note: [report?.completed ? `${report.completed} job${report.completed > 1 ? "s" : ""} signed off from offline work.` : "", report?.stopped ?? ""].filter(Boolean).join(" "),
        });
      } catch {
        /* the phone's storage is unavailable (e.g. private browsing): offline mode just isn't offered */
      }
    };
    void run();
    window.addEventListener("online", run);
    return () => {
      cancelled = true;
      window.removeEventListener("online", run);
    };
  }, []);
  if (!state) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-charcoal-200 bg-white p-3 text-sm">
      <span className="text-charcoal-600">
        {state.at ? `${state.jobs} job${state.jobs === 1 ? "" : "s"} saved on this phone for use without signal (updated ${state.at}).` : "Offline copy not updated."}
        {state.unsent > 0 && <span className="ml-1 font-semibold text-amber-800">{state.unsent} not sent yet.</span>}
        {state.note && <span className="ml-1 font-medium text-emerald-700">{state.note}</span>}
      </span>
      <Link href="/offline" className="font-semibold text-kudu-600 hover:underline" prefetch={false}>Offline jobs →</Link>
    </div>
  );
}
