"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { requirePermission, type AppUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { CUSTOM_ROLE_PREFIX, isRole, type Role } from "@/lib/permissions";
import { toCents } from "@/lib/format";

const MIN_PASSWORD = 10;

/**
 * The role picked in a form: a built-in role ("OFFICE") or a custom one ("custom:<id>").
 * A custom role stores its base role in `role`, which the user falls back to if it is deleted.
 */
async function roleFrom(fd: FormData): Promise<{ role: Role; customRoleId: string | null }> {
  const raw = str(fd, "role");
  if (raw.startsWith(CUSTOM_ROLE_PREFIX)) {
    const db = await tenantDb();
    const custom = await db.customRole.findUnique({ where: { id: raw.slice(CUSTOM_ROLE_PREFIX.length) } });
    if (custom) return { role: custom.baseRole === "ADMIN" ? "OFFICE" : custom.baseRole, customRoleId: custom.id };
  }
  return { role: isRole(raw) ? raw : "OFFICE", customRoleId: null };
}

/** Someone with "Manage users" through a custom role is not an admin: they may not create admins or change an admin's account. */
function isRealAdmin(me: AppUser): boolean {
  return me.role === "ADMIN" && !me.permissions;
}
function adminOnly(me: AppUser, targetRole: Role | undefined, newRole?: Role) {
  if (isRealAdmin(me)) return;
  if (targetRole === "ADMIN" || newRole === "ADMIN") redirect("/settings?err=Only+an+admin+can+make+someone+an+admin+or+change+an+admin%27s+account.#users");
}

/** True when removing admin rights from this user would leave the company with no active admin. */
async function isLastAdmin(id: string): Promise<boolean> {
  const db = await tenantDb();
  const others = await db.user.count({ where: { role: "ADMIN", disabled: false, id: { not: id } } });
  return others === 0;
}

export async function addUser(fd: FormData) {
  const db = await tenantDb();
  const me = await requirePermission("users.manage");
  const email = str(fd, "email").toLowerCase();
  const name = str(fd, "name");
  const password = str(fd, "password");
  const { role, customRoleId } = await roleFrom(fd);
  if (!email || password.length < MIN_PASSWORD) redirect(`/settings?err=Enter+an+email+and+a+password+of+at+least+${MIN_PASSWORD}+characters#users`);
  const existing = await db.user.findUnique({ where: { email } });
  adminOnly(me, existing?.role, role);
  if (existing && existing.role === "ADMIN" && role !== "ADMIN" && (await isLastAdmin(existing.id))) {
    redirect("/settings?err=That+user+is+the+only+admin.+Make+someone+else+an+admin+first.#users");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  await db.user.upsert({
    where: { email },
    update: { name: name || undefined, passwordHash, disabled: false, role, customRoleId },
    create: { email, name: name || email, passwordHash, role, customRoleId },
  });
  redirect("/settings?msg=User+saved#users");
}

export async function resetPassword(fd: FormData) {
  const db = await tenantDb();
  const me = await requirePermission("users.manage");
  const password = str(fd, "password");
  if (password.length < MIN_PASSWORD) redirect(`/settings?err=Password+must+be+at+least+${MIN_PASSWORD}+characters#users`);
  adminOnly(me, (await db.user.findUnique({ where: { id: str(fd, "id") }, select: { role: true } }))?.role);
  await db.user.update({ where: { id: str(fd, "id") }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  redirect("/settings?msg=Password+changed#users");
}

export async function setUserRole(fd: FormData) {
  const db = await tenantDb();
  const me = await requirePermission("users.manage");
  const id = str(fd, "id");
  const { role, customRoleId } = await roleFrom(fd);
  if (id === me.id && !(isRealAdmin(me) && role === "ADMIN")) redirect("/settings?err=You+cannot+change+your+own+role.+Ask+another+admin.#users");
  const user = await db.user.findUnique({ where: { id } });
  if (!user) redirect("/settings?err=User+not+found#users");
  adminOnly(me, user.role, role);
  if (user.role === "ADMIN" && role !== "ADMIN" && (await isLastAdmin(id))) {
    redirect("/settings?err=Make+someone+else+an+admin+first.+A+company+needs+at+least+one+admin.#users");
  }
  await db.user.update({ where: { id }, data: { role, customRoleId } });
  redirect("/settings?msg=Role+changed#users");
}

export async function setUserDisabled(fd: FormData) {
  const db = await tenantDb();
  const me = await requirePermission("users.manage");
  const id = str(fd, "id");
  const disabled = str(fd, "disabled") === "true";
  if (id === me.id) redirect("/settings?err=You+cannot+disable+your+own+account#users");
  adminOnly(me, (await db.user.findUnique({ where: { id }, select: { role: true } }))?.role);
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
