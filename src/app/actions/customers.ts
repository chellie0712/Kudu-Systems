"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { CustomerType } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/form";

export async function saveCustomer(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const data = {
    type: str(fd, "type") === "INDIVIDUAL" ? CustomerType.INDIVIDUAL : CustomerType.BUSINESS,
    name: str(fd, "name"),
    contactPerson: str(fd, "contactPerson"),
    email: str(fd, "email"),
    phone: str(fd, "phone"),
    altPhone: str(fd, "altPhone"),
    vatNumber: str(fd, "vatNumber"),
    regNumber: str(fd, "regNumber"),
    billingAddress: str(fd, "billingAddress"),
    siteAddress: str(fd, "siteAddress"),
    notes: str(fd, "notes"),
  };
  if (!data.name) throw new Error("Customer name is required");
  const customer = id
    ? await db.customer.update({ where: { id }, data })
    : await db.customer.create({ data });
  revalidatePath("/customers");
  redirect(`/customers/${customer.id}?msg=Customer+saved`);
}

export async function setCustomerArchived(fd: FormData) {
  await requireUser();
  const id = str(fd, "id");
  const archived = str(fd, "archived") === "true";
  await db.customer.update({ where: { id }, data: { archived } });
  revalidatePath("/customers");
  redirect(`/customers/${id}?msg=${archived ? "Customer+archived" : "Customer+restored"}`);
}

export async function deleteCustomer(fd: FormData) {
  await requireUser();
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
