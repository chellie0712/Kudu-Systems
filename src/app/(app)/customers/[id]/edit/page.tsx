import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";

export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
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
