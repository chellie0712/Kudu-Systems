import { QuotationStatus, type Prisma } from "@prisma/client";
import { ApiError, apiRoute, listParams, page } from "@/lib/integrations/api";
import { quoteInclude, quoteOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

/** Newest first. ?status=, ?customerId=, ?updatedSince=, ?limit= (up to 100), ?cursor= */
export const GET = apiRoute("read", async (req, { db }) => {
  const p = listParams(req);
  const status = p.q.get("status") || undefined;
  if (status && !(status in QuotationStatus)) throw new ApiError(400, "bad_request", `status must be one of ${Object.keys(QuotationStatus).join(", ")}`);
  const where: Prisma.QuotationWhereInput = {
    ...(status ? { status: status as QuotationStatus } : {}),
    ...(p.q.get("customerId") ? { customerId: p.q.get("customerId")! } : {}),
    ...(p.updatedSince ? { updatedAt: { gte: p.updatedSince } } : {}),
  };
  const pg = page(p);
  return pg.out(await db.quotation.findMany({ where, include: quoteInclude, ...pg.args }), quoteOut);
});
