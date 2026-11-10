"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { CUSTOM_BASE_ROLES, isPermission } from "@/lib/permissions";

const back = (key: "msg" | "err", text: string, edit?: string) =>
  redirect(`/settings/roles?${key}=${encodeURIComponent(text)}${edit ? `&edit=${edit}` : ""}`);

/** Only admins set up roles: someone with a custom role could otherwise give themselves more. */
async function requireAdmin() {
  await requirePermission("settings.manage");
  const me = await requirePermission("users.manage");
  if (me.role !== "ADMIN" || me.permissions) back("err", "Only an admin can set up roles.");
  return me;
}

export async function saveRole(fd: FormData) {
  await requireAdmin();
  const db = await tenantDb();
  const id = str(fd, "id");
  const name = str(fd, "name").slice(0, 60);
  const description = str(fd, "description").slice(0, 300);
  const base = str(fd, "baseRole");
  const baseRole = (CUSTOM_BASE_ROLES as readonly string[]).includes(base) ? (base as (typeof CUSTOM_BASE_ROLES)[number]) : "OFFICE";
  const permissions = [...new Set(fd.getAll("permissions").map(String).filter(isPermission))];
  if (!name) back("err", "Give the role a name.", id || "new");
  if (["admin", "office", "technician"].includes(name.toLowerCase())) back("err", `“${name}” is a built-in role. Choose another name.`, id || "new");
  const clash = await db.customRole.findFirst({ where: { name: { equals: name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (clash) back("err", `There is already a role called “${clash.name}”.`, id || "new");

  const data = { name, description, baseRole, permissions };
  if (id) {
    await db.$transaction([
      db.customRole.update({ where: { id }, data }),
      // Users keep the base role as their fallback.
      db.user.updateMany({ where: { customRoleId: id }, data: { role: baseRole } }),
    ]);
  } else {
    await db.customRole.create({ data });
  }
  revalidatePath("/settings");
  back("msg", `Role “${name}” saved`);
}

export async function deleteRole(fd: FormData) {
  await requireAdmin();
  const db = await tenantDb();
  const role = await db.customRole.findUnique({ where: { id: str(fd, "id") }, include: { _count: { select: { users: true } } } });
  if (!role) back("err", "Role not found.");
  // Its users fall back to the built-in role it was based on (onDelete: SetNull keeps `role`).
  await db.customRole.delete({ where: { id: role!.id } });
  revalidatePath("/settings");
  const n = role!._count.users;
  back("msg", `Role “${role!.name}” deleted${n ? `. ${n} user${n === 1 ? " is" : "s are"} back on the built-in ${role!.baseRole === "TECHNICIAN" ? "Technician" : "Office"} role` : ""}`);
}
