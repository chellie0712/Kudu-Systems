import type { TenantDb } from "./db";
import type { Assignee } from "@/components/TechnicianPicker";

/** Active users a job card can be assigned to, plus the currently assigned one even if since disabled. */
export async function assignees(db: TenantDb, currentId?: string | null): Promise<Assignee[]> {
  const users = await db.user.findMany({
    where: currentId ? { OR: [{ disabled: false }, { id: currentId }] } : { disabled: false },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name || u.email || "Unnamed user", role: u.role }));
}
