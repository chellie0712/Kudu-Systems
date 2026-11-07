import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { QuotationForm } from "@/components/QuotationForm";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const db = await tenantDb();
  await requirePermission("quotations.edit");
  const { id } = await params;
  const [quotation, customers, settings] = await Promise.all([
    db.quotation.findUnique({ where: { id }, include: { items: { orderBy: { sortOrder: "asc" } } } }),
    db.customer.findMany({ select: { id: true, name: true, siteAddress: true }, orderBy: { name: "asc" } }),
    getSettings(),
  ]);
  if (!quotation) notFound();
  return (
    <div>
      <PageHeader title={`Edit ${quotation.number}`} back={{ href: `/quotations/${id}`, label: quotation.number }} />
      <QuotationForm quotation={quotation} customers={customers} settings={settings} />
    </div>
  );
}
