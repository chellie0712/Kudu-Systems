"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CustomerType } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb, type TenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { ensurePrimary } from "@/lib/contacts";
import { emit } from "@/lib/workflows/events";

async function validBranch(db: TenantDb, id: string): Promise<string | null> {
  if (!id) return null;
  return (await db.branch.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
}

export async function saveCustomer(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const id = str(fd, "id");
  const data = {
    type: str(fd, "type") === "INDIVIDUAL" ? CustomerType.INDIVIDUAL : CustomerType.BUSINESS,
    name: str(fd, "name"),
    vatNumber: str(fd, "vatNumber"),
    regNumber: str(fd, "regNumber"),
    billingAddress: str(fd, "billingAddress"),
    siteAddress: str(fd, "siteAddress"),
    notes: str(fd, "notes"),
    leadSource: str(fd, "leadSource").slice(0, 80),
    leadCampaign: str(fd, "leadCampaign").slice(0, 200),
    // Only when the form shows the branch field (i.e. branches exist).
    ...(fd.has("branchId") ? { branchId: (await validBranch(db, str(fd, "branchId"))) } : {}),
  };
  if (!data.name) throw new Error("Customer name is required");
  // The contact fields on the customer form are the primary contact's.
  const primary = { name: str(fd, "contactPerson"), email: str(fd, "email"), phone: str(fd, "phone"), mobile: str(fd, "altPhone") };
  const customer = await db.$transaction(async (tx) => {
    const c = id ? await tx.customer.update({ where: { id }, data }) : await tx.customer.create({ data });
    const existing = await tx.customerContact.findFirst({ where: { customerId: c.id, isPrimary: true } });
    if (existing) await tx.customerContact.update({ where: { id: existing.id }, data: primary });
    else if (Object.values(primary).some(Boolean)) await tx.customerContact.create({ data: { ...primary, customerId: c.id, isPrimary: true } });
    await ensurePrimary(tx, c.id);
    return c;
  });
  if (!id) await emit(db, "customer.created", customer.id);
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}?msg=Customer+saved`);
}

export async function setCustomerArchived(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const id = str(fd, "id");
  const archived = str(fd, "archived") === "true";
  await db.customer.update({ where: { id }, data: { archived } });
  revalidatePath("/customers");
  redirect(`/customers/${id}?msg=${archived ? "Customer+archived" : "Customer+restored"}`);
}

export async function deleteCustomer(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("customers.delete");
  const id = str(fd, "id");
  const counts = await db.customer.findUniqueOrThrow({
    where: { id },
    select: { _count: { select: { quotations: true, jobCards: true, invoices: true } } },
  });
  const { quotations, jobCards, invoices } = counts._count;
  if (quotations + jobCards + invoices > 0) {
    redirect(`/customers/${id}?err=This+customer+has+documents.+Archive+them+instead+of+deleting.`);
  }
  await db.customer.delete({ where: { id } });
  revalidatePath("/customers");
  redirect("/customers?msg=Customer+deleted");
}
