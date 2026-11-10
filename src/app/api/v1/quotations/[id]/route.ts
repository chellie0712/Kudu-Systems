import { apiRoute, notFound } from "@/lib/integrations/api";
import { quoteInclude, quoteOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("read", async (_req, { db }, { id }) => {
  const row = await db.quotation.findUnique({ where: { id }, include: quoteInclude });
  return row ? { quotation: quoteOut(row) } : notFound("quotation");
});
