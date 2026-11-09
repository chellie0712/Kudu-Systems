import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { customersForPicker } from "@/lib/contacts";
import { assignees } from "@/lib/assignees";
import { jobCardFormExtras } from "@/lib/jobCardForm";
import { jobCardContactFields, primaryContact } from "@/lib/contacts";
import { PageHeader } from "@/components/ui";
import { JobCardForm } from "@/components/JobCardForm";

export const metadata = { title: "New job card" };

export default async function NewJobCardPage({ searchParams }: { searchParams: Promise<{ customerId?: string }> }) {
  const db = await tenantDb();
  await requirePermission("jobcards.create");
  const { customerId } = await searchParams;
  const settings = await getSettings();
  const [customers, products, people, extras] = await Promise.all([
    customersForPicker(db, { archived: false }),
    db.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    assignees(db),
    jobCardFormExtras(db),
  ]);
  const c = customerId ? await db.customer.findUnique({ where: { id: customerId } }) : null;
  const contact = c ? await primaryContact(db, c.id) : null;
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
        assignees={people}
        {...extras}
        defaults={
          c
            ? {
                customerId: c.id,
                siteAddress: c.siteAddress || c.billingAddress,
                contactId: contact?.id ?? null,
                ...jobCardContactFields(c, contact),
              }
            : undefined
        }
      />
    </div>
  );
}
