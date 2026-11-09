"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Batch = { state: "more" | "done" | "limit" | "paused" | "not-sending"; sent: number; failed: number; skipped: number; queued: number; message: string };

/**
 * While a campaign is sending and this page is open, asks the server for one batch after another
 * (each batch is about 45 seconds of sending). Closing the page is safe: the daily job carries on.
 */
export function CampaignSender({ id, total, initialDone }: { id: string; total: number; initialDone: number }) {
  const router = useRouter();
  const [done, setDone] = useState(initialDone);
  const [note, setNote] = useState("Sending… keep this page open to send faster.");
  const [running, setRunning] = useState(true);

  useEffect(() => {
    // One loop per mounted page: a loop from an earlier mount stops itself.
    const stopped = { current: false };
    let failures = 0;
    (async () => {
      while (!stopped.current) {
        let r: Batch | null = null;
        try {
          const res = await fetch(`/api/email/campaigns/${id}/batch`, { method: "POST" });
          r = res.ok ? ((await res.json()) as Batch) : null;
        } catch {
          r = null;
        }
        if (stopped.current) return;
        if (!r) {
          failures++;
          setNote(failures > 5 ? "Lost contact with the server. The daily job will carry on, or reload this page." : "Connection problem, trying again…");
          if (failures > 5) break;
          await new Promise((x) => setTimeout(x, 10_000));
          continue;
        }
        failures = 0;
        setDone(total - r.queued);
        if (r.state === "more") {
          if (r.message) setNote(`${r.message} Trying again shortly…`);
          if (r.message) await new Promise((x) => setTimeout(x, 30_000));
          continue;
        }
        setNote(r.state === "limit" ? "Daily limit reached. The rest go out tomorrow." : r.message);
        break;
      }
      setRunning(false);
      // Drop the "Sending to…" notice from the address and show the final numbers.
      router.replace(`/marketing/email/${id}`);
      router.refresh();
    })();
    return () => {
      stopped.current = true;
    };
  }, [id, total, router]);

  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="h-3 overflow-hidden rounded-full bg-charcoal-100">
        <div className="h-full bg-kudu-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-charcoal-600">{running && <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-kudu-600" />}{note}</span>
        <span className="font-semibold">{done} / {total}</span>
      </div>
    </div>
  );
}
