import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { QuotationForm } from "@/components/QuotationForm";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireUser();
  const { customerId } = await searchParams;
  const [customers, settings] = await Promise.all([
    db.customer.findMany({ where: { archived: false }, select: { id: true, name: true, siteAddress: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  return (
    <div>
      <PageHeader
        title="New quotation"
        back={customerId ? { href: `/customers/${customerId}?tab=quotations`, label: "Customer" } : { href: "/quotations", label: "Quotations" }}
      />
      <QuotationForm customers={customers} settings={settings} customerId={customerId} />
    </div>
  );
}
