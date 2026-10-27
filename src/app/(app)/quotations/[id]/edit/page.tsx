import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { QuotationForm } from "@/components/QuotationForm";

export default async function EditQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
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
