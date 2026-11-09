"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { ensurePrimary } from "@/lib/contacts";

const back = (customerId: string, key: "msg" | "err", text: string) =>
  redirect(`/customers/${customerId}?tab=contacts&${key}=${encodeURIComponent(text)}`);

/** Adds a contact to a customer, or saves changes to one. */
export async function saveContact(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const id = str(fd, "id");
  const customerId = str(fd, "customerId");
  const data = {
    name: str(fd, "name").slice(0, 120),
    role: str(fd, "role").slice(0, 120),
    email: str(fd, "email").slice(0, 200),
    phone: str(fd, "phone").slice(0, 40),
    mobile: str(fd, "mobile").slice(0, 40),
    notes: str(fd, "notes").slice(0, 2000),
  };
  if (!data.name && !data.email && !data.phone && !data.mobile) back(customerId, "err", "Give the contact a name, email or phone number.");
  const makePrimary = fd.get("isPrimary") === "on";

  await db.$transaction(async (tx) => {
    let contactId = id;
    if (id) {
      const before = await tx.customerContact.findFirst({ where: { id, customerId } });
      if (!before) back(customerId, "err", "Contact not found.");
      await tx.customerContact.update({ where: { id }, data });
    } else {
      contactId = (await tx.customerContact.create({ data: { ...data, customerId } })).id;
    }
    // The first contact is always primary; otherwise only when ticked.
    await ensurePrimary(tx, customerId, makePrimary ? contactId : undefined);
  });
  revalidatePath(`/customers/${customerId}`);
  back(customerId, "msg", id ? "Contact saved" : "Contact added");
}

export async function makeContactPrimary(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const id = str(fd, "id");
  const c = await db.customerContact.findUnique({ where: { id } });
  if (!c) redirect("/customers");
  if (c.archived) back(c.customerId, "err", "Restore the contact before making it primary.");
  await db.$transaction((tx) => ensurePrimary(tx, c.customerId, c.id));
  revalidatePath(`/customers/${c.customerId}`);
  back(c.customerId, "msg", `${c.name || "Contact"} is now the primary contact`);
}

/** Archived contacts drop out of pickers but still print on the documents made for them. */
export async function setContactArchived(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const id = str(fd, "id");
  const archived = str(fd, "archived") === "true";
  const c = await db.customerContact.findUnique({ where: { id } });
  if (!c) redirect("/customers");
  await db.$transaction(async (tx) => {
    await tx.customerContact.update({ where: { id }, data: { archived, ...(archived ? { isPrimary: false } : {}) } });
    // Archiving the primary passes it to the next contact.
    await ensurePrimary(tx, c.customerId);
  });
  revalidatePath(`/customers/${c.customerId}`);
  back(c.customerId, "msg", archived ? "Contact archived" : "Contact restored");
}

/** A contact can be deleted only while no document names it; otherwise archive it. */
export async function deleteContact(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const id = str(fd, "id");
  const c = await db.customerContact.findUnique({
    where: { id },
    include: { _count: { select: { quotations: true, jobCards: true, invoices: true } } },
  });
  if (!c) redirect("/customers");
  const used = c._count.quotations + c._count.jobCards + c._count.invoices;
  if (used > 0) back(c.customerId, "err", `${c.name || "This contact"} is on ${used} document${used === 1 ? "" : "s"}. Archive the contact instead, so those documents still show who they were for.`);
  await db.$transaction(async (tx) => {
    await tx.customerContact.delete({ where: { id } });
    await ensurePrimary(tx, c.customerId);
  });
  revalidatePath(`/customers/${c.customerId}`);
  back(c.customerId, "msg", "Contact deleted");
}
