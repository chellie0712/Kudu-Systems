import { InvoiceStatus, type Prisma } from "@prisma/client";
import { ApiError, apiRoute, listParams, page } from "@/lib/integrations/api";
import { invoiceInclude, invoiceOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

/** Newest first. ?status=, ?customerId=, ?updatedSince=, ?limit= (up to 100), ?cursor= */
export const GET = apiRoute("read", async (req, { db }) => {
  const p = listParams(req);
  const status = p.q.get("status") || undefined;
  if (status && !(status in InvoiceStatus)) throw new ApiError(400, "bad_request", `status must be one of ${Object.keys(InvoiceStatus).join(", ")}`);
  const where: Prisma.InvoiceWhereInput = {
    ...(status ? { status: status as InvoiceStatus } : {}),
    ...(p.q.get("customerId") ? { customerId: p.q.get("customerId")! } : {}),
    ...(p.updatedSince ? { updatedAt: { gte: p.updatedSince } } : {}),
  };
  const pg = page(p);
  return pg.out(await db.invoice.findMany({ where, include: invoiceInclude, ...pg.args }), invoiceOut);
});
