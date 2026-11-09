import { requirePermission } from "@/auth";
import { getBranches } from "@/lib/branch";
import { CampaignForm } from "@/components/CampaignForm";
import { Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "New email campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await requirePermission("campaigns.edit");
  const { err } = await searchParams;
  const branches = await getBranches();
  return (
    <div className="max-w-4xl">
      <PageHeader back={{ href: "/marketing/email", label: "Email campaigns" }} title="New email campaign" />
      <Flash message={err} tone="error" />
      <CampaignForm branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
    </div>
  );
}
