import { apiRoute, notFound } from "@/lib/integrations/api";
import { jobInclude, jobOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("read", async (_req, { db }, { id }) => {
  const row = await db.jobCard.findUnique({ where: { id }, include: jobInclude });
  return row ? { jobCard: jobOut(row) } : notFound("job card");
});
