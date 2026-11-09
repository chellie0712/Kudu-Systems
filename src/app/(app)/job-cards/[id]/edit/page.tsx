import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, canAccessJobCard } from "@/lib/permissions";
import { assignees } from "@/lib/assignees";
import { jobCardFormExtras } from "@/lib/jobCardForm";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { customersForPicker } from "@/lib/contacts";
import { Flash, PageHeader } from "@/components/ui";
import { JobCardForm } from "@/components/JobCardForm";

export default async function EditJobCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  const user = await requireUser();
  const canAssign = can(user.role, "jobcards.assign");
  const db = await tenantDb();
  const { id } = await params;
  const { msg } = await searchParams;
  const settings = await getSettings();
  const [jobCard, products] = await Promise.all([
    db.jobCard.findUnique({ where: { id }, include: { photos: { select: { id: true, kind: true }, orderBy: { sortOrder: "asc" } } } }),
    db.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  if (!jobCard) notFound();
  if (!canAccessJobCard(user, jobCard)) redirect("/no-access?need=jobcards.viewAll");
  // Technicians see the customer and assignee read-only, so only those are loaded for them.
  const [customers, people, extras] = await Promise.all([
    customersForPicker(db, canAssign ? {} : { id: jobCard.customerId }, jobCard.contactId),
    canAssign ? assignees(db, jobCard.technicianId) : db.user
      .findMany({ where: { id: jobCard.technicianId ?? "" }, select: { id: true, name: true, email: true, role: true } })
      .then((us) => us.map((u) => ({ id: u.id, name: u.name || u.email || "", role: u.role }))),
    jobCardFormExtras(db, jobCard),
  ]);
  return (
    <div>
      <PageHeader title={`Edit ${jobCard.number}`} back={{ href: `/job-cards/${id}`, label: jobCard.number }} />
      <Flash message={msg} />
      <JobCardForm jobCard={jobCard} customers={customers} products={products} settings={settings} assignees={people} canAssign={canAssign} {...extras} />
    </div>
  );
}
