import { JobCardStatus, type Prisma } from "@prisma/client";
import { ApiError, apiRoute, listParams, page } from "@/lib/integrations/api";
import { jobInclude, jobOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

/** Newest first. ?status=, ?customerId=, ?updatedSince=, ?limit= (up to 100), ?cursor= */
export const GET = apiRoute("read", async (req, { db }) => {
  const p = listParams(req);
  const status = p.q.get("status") || undefined;
  if (status && !(status in JobCardStatus)) throw new ApiError(400, "bad_request", `status must be one of ${Object.keys(JobCardStatus).join(", ")}`);
  const where: Prisma.JobCardWhereInput = {
    ...(status ? { status: status as JobCardStatus } : {}),
    ...(p.q.get("customerId") ? { customerId: p.q.get("customerId")! } : {}),
    ...(p.updatedSince ? { updatedAt: { gte: p.updatedSince } } : {}),
  };
  const pg = page(p);
  return pg.out(await db.jobCard.findMany({ where, include: jobInclude, ...pg.args }), jobOut);
});
