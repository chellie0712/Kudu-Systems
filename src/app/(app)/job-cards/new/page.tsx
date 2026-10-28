import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { JobCardForm } from "@/components/JobCardForm";

export const metadata = { title: "New job card" };

export default async function NewJobCardPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  await requireUser();
  const { customerId } = await searchParams;
  const settings = await getSettings();
  const [customers, products] = await Promise.all([
    db.customer.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const c = customerId ? await db.customer.findUnique({ where: { id: customerId } }) : null;
  return (
    <div>
      <PageHeader
        title="New job card"
        back={c ? { href: `/customers/${c.id}?tab=jobcards`, label: c.name } : { href: "/job-cards", label: "Job Cards" }}
      />
      <JobCardForm
        customers={customers}
        products={products}
        settings={settings}
        defaults={
          c
            ? {
                customerId: c.id,
                siteAddress: c.siteAddress || c.billingAddress,
                siteContact: c.contactPerson || (c.type === "INDIVIDUAL" ? c.name : ""),
                contactNumber: c.phone,
              }
            : undefined
        }
      />
    </div>
  );
}
