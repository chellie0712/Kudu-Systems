// Adding and changing records through the API, with the same rules as the screens: the customer's
// contact fields are its primary contact, and workflows (and webhooks) hear about new records.
import { z } from "zod";
import { CustomerType, QueryPriority, type PrismaClient } from "@prisma/client";
import { ensurePrimary } from "@/lib/contacts";
import { nextNumberIn } from "@/lib/settings";
import { emit } from "@/lib/workflows/events";
import { ApiError } from "./api";
import { customerInclude, customerOut, queryInclude, queryOut } from "./serialize";

const text = (max: number) => z.string().trim().max(max);
const email = z.string().trim().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Not an email address");

const customerFields = z.object({
  type: z.enum(["business", "individual"]).optional(),
  name: text(200).optional(),
  contactPerson: text(200).optional(),
  email: email.optional(),
  phone: text(50).optional(),
  altPhone: text(50).optional(),
  vatNumber: text(50).optional(),
  regNumber: text(50).optional(),
  billingAddress: text(1000).optional(),
  siteAddress: text(1000).optional(),
  notes: text(5000).optional(),
  leadSource: text(80).optional(),
  archived: z.boolean().optional(),
});
export type CustomerInput = z.infer<typeof customerFields>;

/** Validates a body; a bad one becomes a 400 answer listing what is wrong. */
export function parse<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (r.success) return r.data;
  const msg = r.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
  throw new ApiError(400, "invalid", msg.slice(0, 1000));
}

export const parseCustomer = (body: unknown, creating: boolean) => {
  const c = parse(customerFields.strict(), body);
  if (creating && !c.name && !c.contactPerson) throw new ApiError(400, "invalid", "name: give the customer (or company) name");
  return c;
};

const CONTACT_KEYS = { contactPerson: "name", email: "email", phone: "phone", altPhone: "mobile" } as const;

export async function saveCustomerFromApi(db: PrismaClient, input: CustomerInput, id?: string) {
  const data = {
    ...(input.type ? { type: input.type === "individual" ? CustomerType.INDIVIDUAL : CustomerType.BUSINESS } : {}),
    ...(input.name !== undefined || !id ? { name: input.name || input.contactPerson || "" } : {}),
    ...Object.fromEntries((["vatNumber", "regNumber", "billingAddress", "siteAddress", "notes", "leadSource", "archived"] as const).filter((k) => input[k] !== undefined).map((k) => [k, input[k]])),
  };
  if (id && "name" in data && !data.name) throw new ApiError(400, "invalid", "name: can't be blank");
  const contact = Object.fromEntries(Object.entries(CONTACT_KEYS).filter(([k]) => input[k as keyof typeof CONTACT_KEYS] !== undefined).map(([k, v]) => [v, input[k as keyof typeof CONTACT_KEYS]]));
  const saved = await db.$transaction(async (tx) => {
    const c = id ? await tx.customer.update({ where: { id }, data }) : await tx.customer.create({ data: { ...data, name: data.name as string, leadSource: input.leadSource || "API" } });
    if (Object.keys(contact).length) {
      const existing = await tx.customerContact.findFirst({ where: { customerId: c.id, isPrimary: true } });
      if (existing) await tx.customerContact.update({ where: { id: existing.id }, data: contact });
      else if (Object.values(contact).some(Boolean)) await tx.customerContact.create({ data: { ...contact, customerId: c.id, isPrimary: true } });
    }
    await ensurePrimary(tx, c.id);
    return c;
  });
  if (!id) await emit(db, "customer.created", saved.id);
  return customerOut(await db.customer.findUniqueOrThrow({ where: { id: saved.id }, include: customerInclude }));
}

const queryFields = z
  .object({
    customerId: z.string().max(60).optional(),
    customer: customerFields.omit({ archived: true }).strict().optional(),
    subject: text(200).min(1, "give a subject"),
    description: text(5000).optional(),
    category: text(60).optional(),
    source: text(60).optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  })
  .strict()
  .refine((q) => q.customerId || q.customer, "give customerId, or customer details to find or add the customer");

/** Logs a query. With customer details instead of an id, finds the customer by email or adds them. */
export async function createQueryFromApi(db: PrismaClient, body: unknown, keyName: string) {
  const q = parse(queryFields, body);
  let customerId = q.customerId ?? "";
  let customerCreated = false;
  if (customerId) {
    if (!(await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) throw new ApiError(400, "invalid", "customerId: no customer with that id");
  } else {
    const c = q.customer!;
    const found = c.email
      ? await db.customer.findFirst({
          where: { archived: false, OR: [{ email: { equals: c.email, mode: "insensitive" } }, { contacts: { some: { email: { equals: c.email, mode: "insensitive" } } } }] },
          select: { id: true },
        })
      : null;
    if (found) customerId = found.id;
    else {
      if (!c.name && !c.contactPerson) throw new ApiError(400, "invalid", "customer.name: give a name (or contactPerson) for the new customer");
      customerId = (await saveCustomerFromApi(db, c)).id;
      customerCreated = true;
    }
  }
  const created = await db.query.create({
    data: {
      number: await nextNumberIn(db, "query"),
      customerId,
      subject: q.subject,
      description: q.description ?? "",
      category: q.category ?? "",
      source: q.source || "API",
      priority: (q.priority as QueryPriority | undefined) ?? QueryPriority.NORMAL,
      createdBy: `API: ${keyName}`.slice(0, 120),
      notes: { create: { text: `Logged through the API (key “${keyName}”)`, system: true, userName: "Kudu" } },
    },
  });
  await emit(db, "query.created", created.id);
  return { query: queryOut(await db.query.findUniqueOrThrow({ where: { id: created.id }, include: queryInclude })), customerCreated };
}
