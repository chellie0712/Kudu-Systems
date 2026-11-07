"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { num, str } from "@/lib/form";
import { ALL_BRANCHES, BRANCH_COOKIE } from "@/lib/branch";

export async function saveBranch(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  const id = str(fd, "id");
  const data = {
    name: str(fd, "name"),
    address: str(fd, "address"),
    phone: str(fd, "phone"),
    email: str(fd, "email"),
    sortOrder: Math.round(num(fd, "sortOrder", 0)),
  };
  if (!data.name) redirect("/settings?err=The+branch+needs+a+name#branches");
  if (id) await db.branch.update({ where: { id }, data: { ...data, active: fd.get("active") === "on" } });
  else await db.branch.create({ data });
  revalidatePath("/", "layout");
  redirect("/settings?msg=Branch+saved#branches");
}

export async function deleteBranch(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("settings.manage");
  // Customers and users of the branch are kept; they just no longer have a branch.
  await db.branch.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/", "layout");
  redirect("/settings?msg=Branch+deleted.+Its+customers+and+users+now+have+no+branch.#branches");
}

export async function setUserBranch(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("users.manage");
  await db.user.update({ where: { id: str(fd, "id") }, data: { branchId: str(fd, "branchId") || null } });
  redirect("/settings?msg=Branch+saved#users");
}

/** The branch switcher in the header: filters lists and the dashboard for this browser. */
export async function chooseBranch(fd: FormData) {
  await requirePermission("customers.view");
  const value = str(fd, "branch") || ALL_BRANCHES;
  (await cookies()).set(BRANCH_COOKIE, value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 24 * 60 * 60, path: "/" });
  revalidatePath("/", "layout");
}
