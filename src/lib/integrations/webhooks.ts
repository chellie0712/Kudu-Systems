// Outgoing webhooks: when something happens (the same events workflows start on), Kudu POSTs a
// signed JSON message to each webhook that asked for it. Messages are stored first, then sent after
// the page has answered; one that is not accepted (no 2xx answer within 10 seconds) is tried again
// after 1 minute, 10 minutes, 1 hour, 6 hours and 1 day. Retries run when pages load and in the
// daily job, so with little use a retry can come later than planned.
//
// Signature: header Kudu-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>" with the secret>.
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Prisma, PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { triggerDef, type TriggerKey } from "@/lib/workflows/defs";
import { subjectData } from "./serialize";
import { MAX_ATTEMPTS, MAX_FAILURES, RETRY_MINUTES } from "./defs";

const TIMEOUT_MS = 10_000;
const DAY = 86_400_000;

// ---------- Addresses ----------

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

function privateIp(ip: string): boolean {
  if (isIP(ip) === 4) return privateV4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return privateV4(mapped[1]);
  return v6 === "::" || v6 === "::1" || /^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || v6.startsWith("ff");
}

const allowPrivate = () => process.env.WEBHOOKS_ALLOW_PRIVATE === "1"; // for testing on your own computer only

/** Null when Kudu may send to this address; otherwise why not, in plain words. */
export async function urlProblem(raw: string): Promise<string | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return "That is not a web address. It should start with https://";
  }
  if (u.protocol !== "https:" && !(allowPrivate() && u.protocol === "http:")) return "The address must start with https://";
  if (u.username || u.password) return "Leave the user name and password out of the address.";
  if (allowPrivate()) return null;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return "The address must be on the public internet.";
  try {
    const ips = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
    if (!ips.length || ips.some(privateIp)) return "The address must be on the public internet.";
  } catch {
    return "That address could not be found. Check the spelling.";
  }
  return null;
}

// ---------- Secrets and signing ----------

export const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;
export const sealSecret = (plain: string) => encryptSecret(plain);
export const openSecret = (sealed: string) => decryptSecret(sealed);

export function signature(secret: string, body: string, at = Math.floor(Date.now() / 1000)): string {
  return `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${body}`).digest("hex")}`;
}

// ---------- Queueing ----------

async function base(): Promise<string> {
  try {
    const { siteUrl } = await import("@/lib/email/links");
    return await siteUrl();
  } catch {
    const v = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
    return v ? (v.startsWith("http") ? v : `https://${v}`).replace(/\/$/, "") : "";
  }
}

const LINKS: Record<string, string> = { customer: "/customers/", quote: "/quotations/", job: "/job-cards/", invoice: "/invoices/", query: "/queries/", submission: "/forms/submissions/" };

export type Payload = { id: string; event: string; createdAt: string; company: string; link: string | null; data: Record<string, unknown> };

async function payloadFor(db: PrismaClient, event: string, link: string | null, data: Record<string, unknown>): Promise<Payload> {
  const s = await db.settings.findUnique({ where: { id: 1 }, select: { companyName: true } });
  return { id: `evt_${randomUUID().replace(/-/g, "")}`, event, createdAt: new Date().toISOString(), company: s?.companyName ?? "", link, data };
}

/** Sends now if possible, otherwise right after the page has answered. */
async function dispatch(db: PrismaClient, ids: string[]) {
  if (!ids.length) return;
  const run = () => deliverAll(db, ids);
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    await run(); // outside a request (scripts): send straight away
  }
}

async function deliverAll(db: PrismaClient, ids: string[]) {
  for (const id of ids) {
    try {
      await deliver(db, id);
    } catch (e) {
      console.error("Webhook delivery failed", e);
    }
  }
}

/** Called from emit(): queues the event for every switched-on webhook that asked for it. Never throws. */
export async function webhookEvent(db: PrismaClient, trigger: TriggerKey, subjectId: string): Promise<void> {
  try {
    const hooks = await db.webhook.findMany({ where: { active: true, events: { has: trigger } }, select: { id: true } });
    if (!hooks.length) return;
    const def = triggerDef(trigger);
    if (!def) return;
    const data = await subjectData(db, def.subject, subjectId);
    if (!data) return;
    const payload = await payloadFor(db, trigger, `${await base()}${LINKS[def.subject]}${subjectId}`, data);
    const ids: string[] = [];
    for (const h of hooks) {
      const d = await db.webhookDelivery.create({ data: { webhookId: h.id, event: trigger, subjectId, payload: payload as unknown as Prisma.InputJsonValue, nextAttemptAt: new Date() }, select: { id: true } });
      ids.push(d.id);
    }
    await dispatch(db, ids);
  } catch (e) {
    console.error(`Webhooks for ${trigger} failed`, e);
  }
}

/** A workflow step: sends the record the workflow ran for to one webhook. Returns the delivery id. */
export async function webhookFromWorkflow(db: PrismaClient, webhookId: string, wf: { id: string; name: string; trigger: string }, subjectId: string): Promise<{ id: string; webhook: string }> {
  const hook = await db.webhook.findUnique({ where: { id: webhookId }, select: { id: true, name: true, active: true } });
  if (!hook) throw new Error("The webhook no longer exists");
  if (!hook.active) throw new Error(`The webhook “${hook.name}” is switched off`);
  const def = triggerDef(wf.trigger);
  if (!def) throw new Error("Unknown trigger");
  const data = await subjectData(db, def.subject, subjectId);
  if (!data) throw new Error("The record is gone");
  const payload = await payloadFor(db, "workflow", `${await base()}${LINKS[def.subject]}${subjectId}`, { workflow: { id: wf.id, name: wf.name, trigger: wf.trigger }, ...data });
  const d = await db.webhookDelivery.create({ data: { webhookId, event: "workflow", subjectId, payload: payload as unknown as Prisma.InputJsonValue, nextAttemptAt: new Date() }, select: { id: true } });
  await dispatch(db, [d.id]);
  return { id: d.id, webhook: hook.name };
}

/** "Send test": a ping, sent while you wait so the answer can be shown. */
export async function sendTest(db: PrismaClient, webhookId: string) {
  const payload = await payloadFor(db, "ping", null, { message: "This is a test from Kudu. If you can read this, the webhook works." });
  const d = await db.webhookDelivery.create({ data: { webhookId, event: "ping", payload: payload as unknown as Prisma.InputJsonValue, nextAttemptAt: new Date() }, select: { id: true } });
  return deliver(db, d.id, { force: true, retry: false });
}

// ---------- Sending ----------

type Result = { ok: boolean; status: number | null; error: string };

/**
 * Sends one stored message. force: even when its webhook is switched off (tests, "Try again").
 * retry: false gives up straight away when it fails (tests).
 */
export async function deliver(db: PrismaClient, deliveryId: string, opts: { force?: boolean; retry?: boolean } = {}): Promise<Result | null> {
  const now = new Date();
  // Claim it, so two pages loading at once don't both send it.
  const claimed = await db.webhookDelivery.updateMany({
    where: { id: deliveryId, status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
    data: { nextAttemptAt: new Date(now.getTime() + 2 * 60_000) },
  });
  if (!claimed.count) return null;
  const d = await db.webhookDelivery.findUniqueOrThrow({ where: { id: deliveryId }, include: { webhook: true } });
  const hook = d.webhook;
  const attempts = d.attempts + 1;

  if (!hook.active && !opts.force) {
    await db.webhookDelivery.update({ where: { id: d.id }, data: { status: "FAILED", attempts: d.attempts, nextAttemptAt: null, error: "Not sent: the webhook is switched off." } });
    return { ok: false, status: null, error: "The webhook is switched off." };
  }

  let result: Result;
  let responseBody = "";
  const problem = await urlProblem(hook.url);
  if (problem) result = { ok: false, status: null, error: problem };
  else {
    const body = JSON.stringify(d.payload);
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Kudu-Webhooks/1.0",
          "Kudu-Event": d.event,
          "Kudu-Delivery": d.id,
          "Kudu-Signature": signature(openSecret(hook.secret), body),
        },
        body,
      });
      responseBody = (await res.text().catch(() => "")).slice(0, 1000);
      result = res.ok ? { ok: true, status: res.status, error: "" } : { ok: false, status: res.status, error: res.status >= 300 && res.status < 400 ? `Answered ${res.status} (a redirect; use the final address)` : `Answered ${res.status}` };
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      result = { ok: false, status: null, error: name === "TimeoutError" ? "No answer within 10 seconds" : `Could not connect: ${e instanceof Error ? (e.cause instanceof Error ? e.cause.message : e.message) : String(e)}`.slice(0, 300) };
    }
  }

  if (result.ok) {
    await db.$transaction([
      db.webhookDelivery.update({ where: { id: d.id }, data: { status: "OK", attempts, nextAttemptAt: null, deliveredAt: new Date(), responseStatus: result.status, responseBody, error: "" } }),
      db.webhook.update({ where: { id: hook.id }, data: { failures: 0, lastSuccessAt: new Date() } }),
    ]);
    return result;
  }
  const giveUp = opts.retry === false || attempts >= MAX_ATTEMPTS;
  const failures = hook.failures + 1;
  const switchOff = hook.active && failures >= MAX_FAILURES;
  await db.$transaction([
    db.webhookDelivery.update({
      where: { id: d.id },
      data: {
        status: giveUp ? "FAILED" : "PENDING",
        attempts,
        nextAttemptAt: giveUp ? null : new Date(Date.now() + RETRY_MINUTES[attempts - 1] * 60_000),
        responseStatus: result.status,
        responseBody,
        error: result.error,
      },
    }),
    db.webhook.update({
      where: { id: hook.id },
      data: {
        failures,
        lastFailureAt: new Date(),
        lastError: switchOff ? `Switched off after ${MAX_FAILURES} failed tries in a row. Last: ${result.error}` : result.error,
        ...(switchOff ? { active: false } : {}),
      },
    }),
  ]);
  return result;
}

/** "Try again" on one message: sends it now. */
export async function retryNow(db: PrismaClient, deliveryId: string): Promise<Result | null> {
  const n = await db.webhookDelivery.updateMany({ where: { id: deliveryId, status: { in: ["PENDING", "FAILED"] } }, data: { status: "PENDING", nextAttemptAt: new Date() } });
  if (!n.count) return null;
  return deliver(db, deliveryId, { force: true });
}

/** Sends the messages whose retry time has come; returns how many were tried. Pages call it without waiting; the daily job too. */
export async function retryDue(db: PrismaClient, now = new Date(), limit = 20): Promise<number> {
  const due = await db.webhookDelivery.findMany({ where: { status: "PENDING", nextAttemptAt: { lte: now } }, orderBy: { nextAttemptAt: "asc" }, take: limit, select: { id: true } });
  let n = 0;
  for (const d of due) {
    try {
      if (await deliver(db, d.id)) n++;
    } catch (e) {
      console.error("Webhook retry failed", e);
    }
  }
  return n;
}

/** For pages: retries due messages after the page has answered, so nobody waits for them. */
export async function retryDueLater(db: PrismaClient) {
  try {
    if (!(await db.webhookDelivery.findFirst({ where: { status: "PENDING", nextAttemptAt: { lte: new Date() } }, select: { id: true } }))) return;
    const { after } = await import("next/server");
    after(() => retryDue(db).catch(() => 0));
  } catch {
    // Next time.
  }
}

/** Daily: retries and clears messages older than 30 days. */
export async function dailyWebhooks(db: PrismaClient, now = new Date()) {
  let retried = 0;
  for (let i = 0; i < 10; i++) {
    const n = await retryDue(db, now, 50);
    retried += n;
    if (n < 50) break;
  }
  const pruned = await db.webhookDelivery.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 30 * DAY) }, status: { not: "PENDING" } } });
  return { retried, pruned: pruned.count };
}
