"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { isRole, type Role } from "@/lib/permissions";
import { toCents } from "@/lib/format";

const MIN_PASSWORD = 10;

function roleFrom(fd: FormData): Role {
  const role = str(fd, "role");
  return isRole(role) ? role : "OFFICE";
}

/** True when removing admin rights from this user would leave the company with no active admin. */
async function isLastAdmin(id: string): Promise<boolean> {
  const db = await tenantDb();
  const others = await db.user.count({ where: { role: "ADMIN", disabled: false, id: { not: id } } });
  return others === 0;
}

export async function addUser(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("users.manage");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  const role = roleFrom(fd);
  if (!email || password.length < MIN_PASSWORD) redirect(`/settings?err=Enter+an+email+and+a+password+of+at+least+${MIN_PASSWORD}+characters#users`);
  const existing = await db.user.findUnique({ where: { email } });
  if (existing && existing.role === "ADMIN" && role !== "ADMIN" && (await isLastAdmin(existing.id))) {
    redirect("/settings?err=That+user+is+the+only+admin.+Make+someone+else+an+admin+first.#users");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { name: name || undefined, passwordHash, disabled: false, role },
    create: { email, name: name || email, passwordHash, role },
  });
  redirect("/settings?msg=User+saved#users");
}

export async function resetPassword(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("users.manage");
  const password = str(fd, "password");
  if (password.length < MIN_PASSWORD) redirect(`/settings?err=Password+must+be+at+least+${MIN_PASSWORD}+characters#users`);
  await db.user.update({ where: { id: str(fd, "id") }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  redirect("/settings?msg=Password+changed#users");
}

export async function setUserRole(fd: FormData) {
  const db = await tenantDb();
  const me = await requirePermission("users.manage");
  const id = str(fd, "id");
  const role = roleFrom(fd);
  if (id === me.id && role !== "ADMIN") redirect("/settings?err=You+cannot+remove+your+own+admin+rights.+Ask+another+admin.#users");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) redirect("/settings?err=User+not+found#users");
  if (user.role === "ADMIN" && role !== "ADMIN" && (await isLastAdmin(id))) {
    redirect("/settings?err=Make+someone+else+an+admin+first.+A+company+needs+at+least+one+admin.#users");
  }
  await db.user.update({ where: { id }, data: { role } });
  redirect("/settings?msg=Role+changed#users");
}

export async function setUserDisabled(fd: FormData) {
  const db = await tenantDb();
  const me = await requirePermission("users.manage");
  const id = str(fd, "id");
  const disabled = str(fd, "disabled") === "true";
  if (id === me.id) redirect("/settings?err=You+cannot+disable+your+own+account#users");
  if (disabled && (await isLastAdmin(id))) {
    const user = await db.user.findUnique({ where: { id }, select: { role: true } });
    if (user?.role === "ADMIN") redirect("/settings?err=You+cannot+disable+the+only+admin#users");
  }
  await db.user.update({ where: { id }, data: { disabled } });
  redirect("/settings?msg=User+updated#users");
}

/** A person's own hourly labour rate; empty means the company rate applies. */
export async function setUserLabourRate(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("users.manage");
  const raw = str(fd, "labourRate");
  await db.user.update({ where: { id: str(fd, "id") }, data: { labourRate: raw ? Math.max(0, toCents(raw)) : null } });
  redirect("/settings?msg=Labour+rate+saved#users");
}
