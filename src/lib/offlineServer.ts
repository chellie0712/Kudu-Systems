import type { JobCard } from "@prisma/client";
import { getUser, type AppUser } from "@/auth";
import { can, canAccessJobCard } from "@/lib/permissions";
import { tenantDb, type TenantDb } from "@/lib/db";

/** The signed-in staff member who may fill in this job card, with the job card; or why not. */
export async function offlineAccess(jobId: string): Promise<{ user: AppUser; db: TenantDb; jc: JobCard } | { status: number; error: string }> {
  const user = await getUser();
  if (!user) return { status: 401, error: "You are signed out. Sign in again to send your work." };
  if (!can(user.role, "jobcards.edit")) return { status: 403, error: "You may not fill in job cards." };
  const db = await tenantDb();
  const jc = jobId ? await db.jobCard.findUnique({ where: { id: jobId } }) : null;
  if (!jc) return { status: 404, error: "This job card no longer exists." };
  if (!canAccessJobCard(user, jc)) return { status: 403, error: "This job is no longer assigned to you." };
  return { user, db, jc };
}
