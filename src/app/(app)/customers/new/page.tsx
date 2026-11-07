import { requirePermission } from "@/auth";
import { CustomerForm } from "@/components/CustomerForm";
import { PageHeader } from "@/components/ui";
import { currentBranchId, getBranches } from "@/lib/branch";
import { tenantDb } from "@/lib/db";
import { adCampaignNames } from "@/lib/marketing";

export const metadata = { title: "New customer" };

export default async function NewCustomerPage() {
  const user = await requirePermission("customers.edit");
  const db = await tenantDb();
  const [branches, branchId, campaigns] = await Promise.all([getBranches(), currentBranchId(), adCampaignNames(db)]);
  return (
    <div>
      <PageHeader title="New customer" back={{ href: "/customers", label: "Customers" }} />
      <CustomerForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} defaultBranchId={branchId ?? user.branchId} campaigns={campaigns} />
    </div>
  );
}
