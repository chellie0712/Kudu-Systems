import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { customersForPicker } from "@/lib/contacts";
import { PageHeader } from "@/components/ui";
import { QuotationForm } from "@/components/QuotationForm";

export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const db = await tenantDb();
  await requirePermission("quotations.edit");
  const { customerId } = await searchParams;
  const [customers, settings] = await Promise.all([
    customersForPicker(db, { archived: false }),
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
