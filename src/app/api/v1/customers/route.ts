import type { Prisma } from "@prisma/client";
import { apiRoute, listParams, page, readJson } from "@/lib/integrations/api";
import { parseCustomer, saveCustomerFromApi } from "@/lib/integrations/records";
import { customerInclude, customerOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

/** Customers, newest first. ?search= (name, email or phone), ?email=, ?updatedSince=, ?includeArchived=true */
export const GET = apiRoute("read", async (req, { db }) => {
  const p = listParams(req);
  const search = p.q.get("search")?.trim();
  const email = p.q.get("email")?.trim();
  const where: Prisma.CustomerWhereInput = {
    ...(p.q.get("includeArchived") === "true" ? {} : { archived: false }),
    ...(p.updatedSince ? { updatedAt: { gte: p.updatedSince } } : {}),
    ...(email ? { OR: [{ email: { equals: email, mode: "insensitive" } }, { contacts: { some: { email: { equals: email, mode: "insensitive" } } } }] } : {}),
    ...(search
      ? { AND: [{ OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { contactPerson: { contains: search, mode: "insensitive" } }] }] }
      : {}),
  };
  const pg = page(p);
  return pg.out(await db.customer.findMany({ where, include: customerInclude, ...pg.args }), customerOut);
});

/** Adds a customer. The contact fields become its primary contact. */
export const POST = apiRoute("write", async (req, { db }) => {
  const input = parseCustomer(await readJson(req), true);
  return Response.json({ customer: await saveCustomerFromApi(db, input) }, { status: 201 });
});
