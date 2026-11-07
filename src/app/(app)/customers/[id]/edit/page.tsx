import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";
import { getBranches } from "@/lib/branch";
import { adCampaignNames } from "@/lib/marketing";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const { id } = await params;
  const [customer, active, campaigns] = await Promise.all([db.customer.findUnique({ where: { id }, include: { branch: true } }), getBranches(), adCampaignNames(db)]);
  if (!customer) notFound();
  return (
    <div>
      <PageHeader title={`Edit ${customer.name}`} back={{ href: `/customers/${id}`, label: customer.name }} />
      <CustomerForm
        customer={customer}
        campaigns={campaigns}
        // Keep the customer's branch selectable even if it has since been made inactive.
        branches={[...active, ...(customer.branch && !customer.branch.active ? [customer.branch] : [])].map((b) => ({ id: b.id, name: b.name }))}
      />
    </div>
  );
}
