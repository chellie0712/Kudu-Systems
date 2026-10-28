import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { InvoiceForm } from "@/components/InvoiceForm";

export const metadata = { title: "New invoice" };

export default async function NewInvoicePage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireUser();
  const { customerId } = await searchParams;
  const [customers, jobCards, settings] = await Promise.all([
    db.customer.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.jobCard.findMany({
      where: customerId ? { customerId } : {},
      select: { id: true, number: true, customerId: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    getSettings(),
  ]);
  return (
    <div>
      <PageHeader
        title="New invoice"
        back={customerId ? { href: `/customers/${customerId}?tab=invoices`, label: "Customer" } : { href: "/invoices", label: "Invoices" }}
      />
      <InvoiceForm customers={customers} jobCards={jobCards} settings={settings} customerId={customerId} />
    </div>
  );
}
