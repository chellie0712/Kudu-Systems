import { apiRoute, notFound, readJson } from "@/lib/integrations/api";
import { parseCustomer, saveCustomerFromApi } from "@/lib/integrations/records";
import { customerInclude, customerOut } from "@/lib/integrations/serialize";

export const dynamic = "force-dynamic";

export const GET = apiRoute<{ id: string }>("read", async (_req, { db }, { id }) => {
  const c = await db.customer.findUnique({ where: { id }, include: customerInclude });
  return c ? { customer: customerOut(c) } : notFound("customer");
});

/** Changes only the fields sent. */
export const PATCH = apiRoute<{ id: string }>("write", async (req, { db }, { id }) => {
  const input = parseCustomer(await readJson(req), false);
  if (!(await db.customer.findUnique({ where: { id }, select: { id: true } }))) notFound("customer");
  return { customer: await saveCustomerFromApi(db, input, id) };
});
