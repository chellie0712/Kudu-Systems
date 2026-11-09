// Customer contacts: the people at a customer. One contact is primary; quotations, job cards
// and invoices default to it and print the contact they were made for.
//
// The customer's own contactPerson / email / phone / altPhone are kept as a copy of the
// primary contact, so everything that reads them (accounting sync, email campaigns, the
// customer portal, customer search) keeps working unchanged.
import type { Customer, CustomerContact, Prisma, PrismaClient } from "@prisma/client";

type Tx = PrismaClient | Prisma.TransactionClient;

export type ContactOption = Pick<CustomerContact, "id" | "name" | "role" | "email" | "phone" | "mobile" | "isPrimary">;
export type CustomerWithContacts = { id: string; name: string; type?: string; contacts: ContactOption[] };

/** Contacts as offered in pickers: primary first, then by name; archived ones left out. */
export const pickerContacts = {
  where: { archived: false },
  orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }, { createdAt: "asc" as const }],
  select: { id: true, name: true, role: true, email: true, phone: true, mobile: true, isPrimary: true },
};

/** A short name for a contact: the name, else the email, else the number. */
export function contactLabel(c: Pick<CustomerContact, "name" | "email" | "phone" | "mobile">): string {
  return c.name || c.email || c.phone || c.mobile || "Unnamed contact";
}

/** Copies the primary contact onto the customer's own contact fields (blank when there is none). */
export async function syncPrimaryMirror(tx: Tx, customerId: string) {
  const p = await tx.customerContact.findFirst({ where: { customerId, isPrimary: true } });
  await tx.customer.update({
    where: { id: customerId },
    data: { contactPerson: p?.name ?? "", email: p?.email ?? "", phone: p?.phone ?? "", altPhone: p?.mobile ?? "" },
  });
}

/** Makes sure exactly one contact is primary when the customer has any, then refreshes the copy. */
export async function ensurePrimary(tx: Tx, customerId: string, preferId?: string) {
  const contacts = await tx.customerContact.findMany({
    where: { customerId },
    orderBy: [{ archived: "asc" }, { isPrimary: "desc" }, { createdAt: "asc" }],
    select: { id: true, isPrimary: true, archived: true },
  });
  const live = contacts.filter((c) => !c.archived);
  const pick = (preferId && live.find((c) => c.id === preferId)) || live.find((c) => c.isPrimary) || live[0];
  await tx.customerContact.updateMany({ where: { customerId, isPrimary: true, ...(pick ? { id: { not: pick.id } } : {}) }, data: { isPrimary: false } });
  if (pick && !pick.isPrimary) await tx.customerContact.update({ where: { id: pick.id }, data: { isPrimary: true } });
  await syncPrimaryMirror(tx, customerId);
}

/** The contact id from a form, if it belongs to the customer; otherwise the customer's primary contact. */
export async function contactForDoc(db: Tx, customerId: string, contactId: string): Promise<string | null> {
  if (!customerId) return null;
  if (contactId) {
    const c = await db.customerContact.findFirst({ where: { id: contactId, customerId }, select: { id: true } });
    if (c) return c.id;
  }
  const p = await db.customerContact.findFirst({ where: { customerId, isPrimary: true }, select: { id: true } });
  return p?.id ?? null;
}

/** The contact the documents for a customer default to. */
export async function primaryContact(db: Tx, customerId: string) {
  return db.customerContact.findFirst({ where: { customerId, isPrimary: true } });
}

/**
 * The name and number a job card shows for its contact. An individual's own name is used
 * when the contact has none.
 */
export function jobCardContactFields(
  customer: Pick<Customer, "name" | "type" | "contactPerson" | "phone">,
  contact?: Pick<CustomerContact, "name" | "phone" | "mobile"> | null,
): { siteContact: string; contactNumber: string } {
  if (contact) {
    return {
      siteContact: contact.name || (customer.type === "INDIVIDUAL" ? customer.name : ""),
      contactNumber: contact.phone || contact.mobile,
    };
  }
  return {
    siteContact: customer.contactPerson || (customer.type === "INDIVIDUAL" ? customer.name : ""),
    contactNumber: customer.phone,
  };
}

/** The customer as printed on a document: the document's own contact replaces the primary one. */
export function withDocContact<C extends Pick<Customer, "contactPerson" | "email" | "phone">>(
  customer: C,
  contact?: Pick<CustomerContact, "name" | "email" | "phone" | "mobile"> | null,
): C {
  if (!contact) return customer;
  return { ...customer, contactPerson: contact.name, email: contact.email, phone: contact.phone || contact.mobile };
}

/**
 * Customers with their contacts, for the customer and contact selects. `keepContactId` keeps
 * a document's own contact in the list even when it has since been archived.
 */
export async function customersForPicker(
  db: Tx,
  where: Prisma.CustomerWhereInput,
  keepContactId?: string | null,
): Promise<CustomerWithContacts[]> {
  return db.customer.findMany({
    where,
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      contacts: {
        ...pickerContacts,
        where: keepContactId ? { OR: [{ archived: false }, { id: keepContactId }] } : pickerContacts.where,
      },
    },
  });
}
