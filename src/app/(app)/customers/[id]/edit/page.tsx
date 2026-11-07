import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const db = await tenantDb();
  await requirePermission("customers.edit");
  const { id } = await params;
  const customer = await db.customer.findUnique({ where: { id } });
  if (!customer) notFound();
  return (
    <div>
      <PageHeader title={`Edit ${customer.name}`} back={{ href: `/customers/${id}`, label: customer.name }} />
      <CustomerForm customer={customer} />
    </div>
  );
}
