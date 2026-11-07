"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { newInviteToken } from "@/lib/portal";

const back = (customerId: string, kind: "msg" | "err", text: string): never =>
  redirect(`/customers/${customerId}?tab=portal&${kind}=${encodeURIComponent(text)}`);

/** Gives one of the customer's contacts a portal login; the office sends them the link to set a password. */
export async function invitePortalUser(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("portal.manage");
  const customerId = str(fd, "customerId");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const customer = await db.customer.findUnique({ where: { id: customerId }, select: { id: true } });
  if (!customer) redirect("/customers");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back(customerId, "err", "Enter a valid email address.");
  const taken = await db.portalUser.findUnique({ where: { email }, include: { customer: { select: { name: true } } } });
  if (taken) back(customerId, "err", `${email} already has portal access for ${taken.customer.name}.`);
  await db.portalUser.create({ data: { customerId, email, name, createdBy: user.name, ...newInviteToken() } });
  revalidatePath(`/customers/${customerId}`);
  back(customerId, "msg", `Portal access created for ${name || email}. Send them the link below.`);
}

async function portalUserFor(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("portal.manage");
  const pu = await db.portalUser.findUnique({ where: { id: str(fd, "id") } });
  if (!pu) redirect("/customers");
  return { db, pu };
}

/** A fresh link: for an invite that expired, or a customer who forgot their password. */
export async function newPortalLink(fd: FormData) {
  const { db, pu } = await portalUserFor(fd);
  await db.portalUser.update({ where: { id: pu.id }, data: newInviteToken() });
  back(pu.customerId, "msg", `New link made for ${pu.name || pu.email}. Send it to them; their old password keeps working until they set a new one.`);
}

export async function setPortalUserDisabled(fd: FormData) {
  const { db, pu } = await portalUserFor(fd);
  const disabled = str(fd, "disabled") === "true";
  await db.portalUser.update({ where: { id: pu.id }, data: { disabled, ...(disabled ? { inviteToken: null, inviteExpiresAt: null } : {}) } });
  back(pu.customerId, "msg", `Portal access ${disabled ? "switched off" : "switched on"} for ${pu.name || pu.email}.`);
}

export async function deletePortalUser(fd: FormData) {
  const { db, pu } = await portalUserFor(fd);
  await db.portalUser.delete({ where: { id: pu.id } });
  back(pu.customerId, "msg", `Portal access removed for ${pu.name || pu.email}.`);
}
