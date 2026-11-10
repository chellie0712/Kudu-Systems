// API keys and webhooks: names and lists the settings pages (and the workflow builder) share.
// No server code here.
import { TRIGGERS, type TriggerKey } from "@/lib/workflows/defs";

/** Things a webhook can be told about: the workflow triggers that happen at a moment (not the daily timed ones). */
export const WEBHOOK_EVENTS = (Object.entries(TRIGGERS) as [TriggerKey, (typeof TRIGGERS)[TriggerKey]][])
  .filter(([, t]) => !("timed" in t && t.timed))
  .map(([key, t]) => ({ key, label: t.label, group: t.group }));

export const isWebhookEvent = (k: string): k is TriggerKey => WEBHOOK_EVENTS.some((e) => e.key === k);

export const API_ACCESS = {
  read: "Read only: look up customers, quotations, job cards, invoices and queries",
  write: "Read and write: also add and update customers and log queries",
} as const;
export type ApiAccess = keyof typeof API_ACCESS;

/** Wait before each retry of a webhook message that was not accepted, in minutes. 6 tries in all. */
export const RETRY_MINUTES = [1, 10, 60, 360, 1440];
export const MAX_ATTEMPTS = RETRY_MINUTES.length + 1;
/** A webhook is switched off after this many failed tries in a row. */
export const MAX_FAILURES = 50;

export const DELIVERY_STATUS: Record<string, string> = { PENDING: "Trying", OK: "Delivered", FAILED: "Gave up" };
