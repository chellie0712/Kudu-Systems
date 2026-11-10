import { apiRoute, notFound } from "@/lib/integrations/api";
import { queryInclude, queryOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("read", async (_req, { db }, { id }) => {
  const row = await db.query.findUnique({ where: { id }, include: queryInclude });
  return row ? { query: queryOut(row) } : notFound("query");
});
