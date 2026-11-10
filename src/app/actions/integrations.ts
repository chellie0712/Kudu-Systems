"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { currentCompany } from "@/lib/db";
import { str } from "@/lib/form";
import { newApiKey } from "@/lib/integrations/api";
import { isWebhookEvent } from "@/lib/integrations/defs";
import { newSecret, retryNow, sealSecret, sendTest, urlProblem } from "@/lib/integrations/webhooks";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const PAGE = "/settings/api";

export type NewKeyState = { key?: string; name?: string; error?: string };

/** Makes a key and hands it back once, to show on the page; only its hash is kept. */
export async function createApiKey(_prev: NewKeyState, fd: FormData): Promise<NewKeyState> {
  const user = await requirePermission("integrations.manage");
  const { db, company } = await currentCompany();
  const name = str(fd, "name").slice(0, 80);
  if (!name) return { error: "Give the key a name, e.g. the system that will use it." };
  const access = str(fd, "access") === "write" ? "write" : "read";
  const k = newApiKey(company.slug);
  await db.apiKey.create({ data: { name, access, hash: k.hash, prefix: k.prefix, createdBy: user.name } });
  revalidatePath(PAGE);
  return { key: k.key, name };
}

export async function revokeApiKey(fd: FormData) {
  await requirePermission("integrations.manage");
  const { db } = await currentCompany();
  const n = await db.apiKey.updateMany({ where: { id: str(fd, "id"), revokedAt: null }, data: { revokedAt: new Date() } });
  revalidatePath(PAGE);
  go(PAGE, "msg", n.count ? "Key revoked. Anything still using it is refused from now on." : "That key was already revoked.");
}

export async function saveWebhook(fd: FormData) {
  const user = await requirePermission("integrations.manage");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  const back = id ? `${PAGE}/webhooks/${id}` : `${PAGE}/webhooks/new`;
  const name = str(fd, "name").slice(0, 80);
  const url = str(fd, "url").slice(0, 2000);
  const events = [...new Set(fd.getAll("events").map(String).filter(isWebhookEvent))];
  const active = fd.get("active") === "on";
  if (!name) go(back, "err", "Give the webhook a name.");
  const problem = await urlProblem(url);
  if (problem) go(back, "err", problem);
  if (id) {
    const before = await db.webhook.findUnique({ where: { id } });
    if (!before) redirect(PAGE);
    // Switching it back on starts the failure count again.
    await db.webhook.update({ where: { id }, data: { name, url, events, active, ...(active && !before.active ? { failures: 0, lastError: "" } : {}) } });
    revalidatePath(PAGE);
    go(back, "msg", "Webhook saved.");
  }
  const w = await db.webhook.create({ data: { name, url, events, active, secret: sealSecret(newSecret()), createdBy: user.name } });
  revalidatePath(PAGE);
  go(`${PAGE}/webhooks/${w.id}`, "msg", "Webhook added. Copy the signing secret below into the other system, then press Send test.");
}

export async function rotateWebhookSecret(fd: FormData) {
  await requirePermission("integrations.manage");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  await db.webhook.update({ where: { id }, data: { secret: sealSecret(newSecret()) } });
  go(`${PAGE}/webhooks/${id}`, "msg", "New signing secret made. Messages are signed with it from now on; put it in the other system.");
}

export async function deleteWebhook(fd: FormData) {
  await requirePermission("integrations.manage");
  const { db } = await currentCompany();
  const w = await db.webhook.delete({ where: { id: str(fd, "id") } });
  revalidatePath(PAGE);
  go(PAGE, "msg", `“${w.name}” deleted.`);
}

export async function testWebhook(fd: FormData) {
  await requirePermission("integrations.manage");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  const r = await sendTest(db, id);
  revalidatePath(`${PAGE}/webhooks/${id}`);
  if (r?.ok) go(`${PAGE}/webhooks/${id}`, "msg", `Test delivered: the other system answered ${r.status}.`);
  go(`${PAGE}/webhooks/${id}`, "err", `Test not accepted: ${r?.error ?? "it could not be sent"}.`);
}

export async function retryDelivery(fd: FormData) {
  await requirePermission("integrations.manage");
  const { db } = await currentCompany();
  const d = await db.webhookDelivery.findUnique({ where: { id: str(fd, "id") }, select: { id: true, webhookId: true } });
  if (!d) redirect(PAGE);
  const r = await retryNow(db, d.id);
  const back = `${PAGE}/webhooks/${d.webhookId}`;
  revalidatePath(back);
  if (r?.ok) go(back, "msg", `Delivered: answered ${r.status}.`);
  go(back, "err", r ? `Not accepted: ${r.error}.` : "Already delivered.");
}
