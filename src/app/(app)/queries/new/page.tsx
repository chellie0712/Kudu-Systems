import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { customerBranchWhere } from "@/lib/branch";
import { createQuery } from "@/app/actions/queries";
import { Flash, PageHeader } from "@/components/ui";
import { QueryFields } from "@/components/Queries";
import { staffList } from "@/lib/queriesServer";

export const metadata = { title: "Log query" };

export default async function NewQueryPage({ searchParams }: { searchParams: Promise<{ customerId?: string; jobCardId?: string; err?: string }> }) {
  await requirePermission("queries.edit");
  const db = await tenantDb();
  const { customerId, jobCardId, err } = await searchParams;
  const customer = customerId ? await db.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } }) : null;
  const jobCard = jobCardId ? await db.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, number: true, customerId: true } }) : null;
  const [staff, customers] = await Promise.all([
    staffList(db),
    customer ? Promise.resolve(undefined) : db.customer.findMany({ where: { archived: false, ...(await customerBranchWhere()) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Log a query"
        subtitle={[customer?.name, jobCard && `about job card ${jobCard.number}`].filter(Boolean).join(" · ") || undefined}
        back={customer ? { href: `/customers/${customer.id}?tab=queries`, label: customer.name } : { href: "/queries", label: "Queries" }}
      />
      <Flash message={err} tone="error" />
      <form action={createQuery} className="card space-y-4 p-6">
        {jobCard && jobCard.customerId === customer?.id && <input type="hidden" name="jobCardId" value={jobCard.id} />}
        <QueryFields staff={staff} customers={customers} customerId={customer?.id} />
        <button className="btn-primary">Log query</button>
      </form>
    </div>
  );
}
