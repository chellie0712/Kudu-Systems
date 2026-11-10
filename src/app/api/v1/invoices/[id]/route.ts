import { apiRoute, notFound } from "@/lib/integrations/api";
import { invoiceInclude, invoiceOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("read", async (_req, { db }, { id }) => {
  const row = await db.invoice.findUnique({ where: { id }, include: invoiceInclude });
  return row ? { invoice: invoiceOut(row) } : notFound("invoice");
});
