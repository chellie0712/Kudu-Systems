import { requirePermission } from "@/auth";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  await requirePermission("customers.edit");
  return (
    <div>
      <PageHeader title="New customer" back={{ href: "/customers", label: "Customers" }} />
      <CustomerForm />
    </div>
  );
}
