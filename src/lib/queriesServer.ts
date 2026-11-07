import type { TenantDb } from "@/lib/db";

/** Active office staff and admins: the people a query can be assigned to. */
export async function staffList(db: TenantDb, includeId?: string | null) {
  const users = await db.user.findMany({
    where: { OR: [{ disabled: false, role: { in: ["ADMIN", "OFFICE"] } }, ...(includeId ? [{ id: includeId }] : [])] },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  return users.map((u) => ({ id: u.id, name: u.name || u.email || "Unnamed user" }));
}
