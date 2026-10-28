import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Flash, PageHeader } from "@/components/ui";
import { JobCardForm } from "@/components/JobCardForm";

export default async function EditJobCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { msg } = await searchParams;
  const settings = await getSettings();
  const [jobCard, customers, products] = await Promise.all([
    db.jobCard.findUnique({ where: { id }, include: { photos: { select: { id: true, kind: true }, orderBy: { sortOrder: "asc" } } } }),
    db.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.product.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  if (!jobCard) notFound();
  return (
    <div>
      <PageHeader title={`Edit ${jobCard.number}`} back={{ href: `/job-cards/${id}`, label: jobCard.number }} />
      <Flash message={msg} />
      <JobCardForm jobCard={jobCard} customers={customers} products={products} settings={settings} />
    </div>
  );
}
