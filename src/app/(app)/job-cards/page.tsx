import Link from "next/link";
import { JobCardStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { CUSTOM_PREFIX, STAGES } from "@/lib/jobStatus";
import { tenantDb } from "@/lib/db";
import { docBranchWhere } from "@/lib/branch";
import { Flash, PageHeader } from "@/components/ui";
import { JobCardTable } from "@/components/DocTables";
import { StatusFilter } from "@/components/StatusFilter";

export const metadata = { title: "Job Cards" };

export default async function JobCardsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; msg?: string }> }) {
  const db = await tenantDb();
  const user = await requireUser();
  const all = can(user, "jobcards.viewAll");
  const { status, q = "", msg } = await searchParams;
  const customs = await db.jobStatus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } });
  const customId = status?.startsWith(CUSTOM_PREFIX) ? status.slice(CUSTOM_PREFIX.length) : null;
  const rows = await db.jobCard.findMany({
    where: {
      ...(await docBranchWhere()),
      // Technicians only see the jobs assigned to them.
      ...(all ? {} : { technicianId: user.id }),
      ...(status && status in JobCardStatus ? { status: status as JobCardStatus } : {}),
      ...(customId ? { statusId: customId } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { technician: { contains: q, mode: "insensitive" } },
              { jobType: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { id: true, name: true } }, customStatus: { select: { name: true, colour: true } } },
    orderBy: [{ scheduledStart: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 300,
  });
  return (
    <div>
      <PageHeader
        title={all ? "Job Cards" : "My Job Cards"}
        actions={can(user, "jobcards.create") ? <Link href="/job-cards/new" className="btn-primary">+ New job card</Link> : undefined}
      />
      <Flash message={msg} />
      <StatusFilter base="/job-cards" current={status} q={q} statuses={[...STAGES, ...customs.map((c) => ({ value: `${CUSTOM_PREFIX}${c.id}`, label: c.name }))]} />
      <div className="card overflow-x-auto">
        <JobCardTable rows={rows} linkCustomers={can(user, "customers.view")} empty={all ? undefined : "No job cards are assigned to you."} />
      </div>
    </div>
  );
}
