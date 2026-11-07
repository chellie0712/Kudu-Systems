import type { Prisma } from "@prisma/client";

/** What a customer may see in the portal: never drafts or cancelled documents. */
export const portalQuotes = (customerId: string) => ({ customerId, status: { not: "DRAFT" } }) satisfies Prisma.QuotationWhereInput;
export const portalInvoices = (customerId: string) => ({ customerId, status: { in: ["SENT", "PARTIALLY_PAID", "PAID"] } }) satisfies Prisma.InvoiceWhereInput;
export const portalJobs = (customerId: string) => ({ customerId, status: { not: "CANCELLED" } }) satisfies Prisma.JobCardWhereInput;

export const isOverdueInvoice = (i: { status: string; dueDate: Date; total: number; amountPaid: number }, now = new Date()) =>
  i.status !== "PAID" && i.total > i.amountPaid && i.dueDate < now;
