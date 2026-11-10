import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { Empty, Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Form submissions" };

export default async function SubmissionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; q?: string; msg?: string }> }) {
  const user = await requirePermission("forms.view");
  const db = await tenantDb();
  const { id } = await params;
  const { view = "all", q = "", msg } = await searchParams;
  const form = await db.form.findUnique({ where: { id } });
  if (!form) notFound();
  const where: Prisma.FormSubmissionWhereInput = {
    formId: id,
    ...(view === "new" ? { reviewedAt: null } : {}),
    ...(q ? { OR: [{ summary: { contains: q, mode: "insensitive" } }, { customer: { name: { contains: q, mode: "insensitive" } } }, { submittedBy: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const rows = await db.formSubmission.findMany({
    where,
    include: { customer: { select: { id: true, name: true } }, jobCard: { select: { id: true, number: true } } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  return (
    <div className="max-w-5xl">
      <PageHeader
        back={{ href: "/forms", label: "Forms" }}
        title={`${form.name}: submissions`}
        actions={
          <>
            <a href={`/api/forms/${form.id}/csv`} className="btn-outline">Download CSV</a>
            {can(user, "forms.manage") && <Link href={`/forms/${form.id}/edit`} className="btn-outline">Edit form</Link>}
          </>
        }
      />
      <Flash message={msg} />
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <select name="view" defaultValue={view} className="input w-auto">
          <option value="all">All</option>
          <option value="new">Not dealt with</option>
        </select>
        <input name="q" defaultValue={q} placeholder="Search answers, customer or who" className="input max-w-xs" />
        <button className="btn-dark">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No submissions yet.</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>When</th><th>Answers</th><th>For</th><th>From</th><th /></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap text-sm">{fmtDateTime(s.createdAt)}</td>
                  <td><Link href={`/forms/submissions/${s.id}`} className="font-medium text-kudu-700 hover:underline">{s.summary || "Open"}</Link></td>
                  <td className="text-sm">
                    {s.customer && <Link href={`/customers/${s.customer.id}?tab=forms`} className="hover:text-kudu-600">{s.customer.name}</Link>}
                    {s.jobCard && <div><Link href={`/job-cards/${s.jobCard.id}`} className="text-xs hover:text-kudu-600">{s.jobCard.number}</Link></div>}
                  </td>
                  <td className="text-sm">{s.source === "web" ? "Website" : s.submittedBy}</td>
                  <td>{!s.reviewedAt && <span className="rounded-full bg-kudu-600 px-2 py-0.5 text-xs font-semibold text-white">New</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
