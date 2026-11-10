import { cache } from "react";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";

/** Cookie holding the branch chosen in the header: a branch id, or "all". */
export const BRANCH_COOKIE = "kudu_branch";
export const ALL_BRANCHES = "all";

/** Active branches, in display order. */
export const getBranches = cache(async () => {
  const db = await tenantDb();
  return db.branch.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
});

/**
 * The branch the lists and dashboard are filtered to, or null for all branches.
 * Uses the choice made in the header; without one, the user's home branch.
 * Technicians are never filtered (they only see their own jobs anyway).
 */
export const currentBranchId = cache(async (): Promise<string | null> => {
  const user = await getUser();
  if (!user || !can(user, "customers.view")) return null;
  const branches = await getBranches();
  if (!branches.length) return null;
  const chosen = (await cookies()).get(BRANCH_COOKIE)?.value;
  if (chosen === ALL_BRANCHES) return null;
  const id = chosen || user.branchId;
  return branches.some((b) => b.id === id) ? id! : null;
});

/** Prisma filter for documents (quotations, job cards, invoices) of the current branch's customers. */
export async function docBranchWhere(): Promise<{ customer?: { branchId: string } }> {
  const id = await currentBranchId();
  return id ? { customer: { branchId: id } } : {};
}

/** Prisma filter for customers of the current branch. */
export async function customerBranchWhere(): Promise<{ branchId?: string }> {
  const id = await currentBranchId();
  return id ? { branchId: id } : {};
}
