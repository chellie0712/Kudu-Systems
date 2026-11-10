import { QueryStatus, type Prisma } from "@prisma/client";
import { ApiError, apiRoute, listParams, page, readJson } from "@/lib/integrations/api";
import { createQueryFromApi } from "@/lib/integrations/records";
import { queryInclude, queryOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

/** Newest first. ?status=, ?customerId=, ?updatedSince=, ?limit= (up to 100), ?cursor= */
export const GET = apiRoute("read", async (req, { db }) => {
  const p = listParams(req);
  const status = p.q.get("status") || undefined;
  if (status && !(status in QueryStatus)) throw new ApiError(400, "bad_request", `status must be one of ${Object.keys(QueryStatus).join(", ")}`);
  const where: Prisma.QueryWhereInput = {
    ...(status ? { status: status as QueryStatus } : {}),
    ...(p.q.get("customerId") ? { customerId: p.q.get("customerId")! } : {}),
    ...(p.updatedSince ? { updatedAt: { gte: p.updatedSince } } : {}),
  };
  const pg = page(p);
  return pg.out(await db.query.findMany({ where, include: queryInclude, ...pg.args }), queryOut);
});

/**
 * Logs a customer query (a lead, complaint or request). Give customerId, or customer details:
 * the customer is found by email, or added.
 */
export const POST = apiRoute("write", async (req, { db, keyName }) => {
  return Response.json(await createQueryFromApi(db, await readJson(req), keyName), { status: 201 });
});
