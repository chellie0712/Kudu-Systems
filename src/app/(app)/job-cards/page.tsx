import Link from "next/link";
import { JobCardStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { Flash, PageHeader } from "@/components/ui";
import { JobCardTable } from "@/components/DocTables";
import { StatusFilter } from "@/components/StatusFilter";

export const metadata = { title: "Job Cards" };

export default async function JobCardsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; msg?: string }> }) {
  await requireUser();
  const { status, q = "", msg } = await searchParams;
  const rows = await db.jobCard.findMany({
    where: {
      ...(status && status in JobCardStatus ? { status: status as JobCardStatus } : {}),
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
    include: { customer: { select: { id: true, name: true } } },
    orderBy: [{ scheduledStart: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
    take: 300,
  });
  return (
    <div>
      <PageHeader title="Job Cards" actions={<Link href="/job-cards/new" className="btn-primary">+ New job card</Link>} />
      <Flash message={msg} />
      <StatusFilter base="/job-cards" current={status} q={q} statuses={Object.keys(JobCardStatus)} />
      <div className="card overflow-x-auto">
        <JobCardTable rows={rows} />
      </div>
    </div>
  );
}
