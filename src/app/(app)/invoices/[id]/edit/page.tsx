import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Flash, PageHeader } from "@/components/ui";
import { InvoiceForm } from "@/components/InvoiceForm";

export default async function EditInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { msg } = await searchParams;
  const invoice = await db.invoice.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!invoice) notFound();
  const [customers, jobCards, settings] = await Promise.all([
    db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.jobCard.findMany({ where: { customerId: invoice.customerId }, select: { id: true, number: true, customerId: true }, orderBy: { createdAt: "desc" } }),
    getSettings(),
  ]);
  return (
    <div>
      <PageHeader title={`Edit ${invoice.number}`} back={{ href: `/invoices/${id}`, label: invoice.number }} />
      <Flash message={msg} />
      <InvoiceForm invoice={invoice} customers={customers} jobCards={jobCards} settings={settings} />
    </div>
  );
}
