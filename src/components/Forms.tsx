import Link from "next/link";
import type { AppUser } from "@/auth";
import type { TenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";

/**
 * Forms section for a customer profile or a job card: the forms that can be
 * filled in for it, and what has been filled in so far.
 */
export async function LinkedForms({
  db,
  user,
  link,
  className = "",
}: {
  db: TenantDb;
  user: AppUser;
  link: { customerId: string } | { jobCardId: string };
  className?: string;
}) {
  if (!can(user, "forms.fill")) return null;
  const onJob = "jobCardId" in link;
  const [forms, submissions] = await Promise.all([
    db.form.findMany({
      where: { active: true, internal: true, linkTo: onJob ? "jobCard" : { in: ["customer", ""] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.formSubmission.findMany({
      // Without forms.view, staff see only what they filled in themselves.
      where: { ...link, ...(can(user, "forms.view") ? {} : { submittedById: user.id }) },
      include: { form: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (forms.length === 0 && submissions.length === 0) {
    return onJob ? null : <p className="card p-5 text-sm text-charcoal-500">No forms yet. Build one under Forms and set it to be filled in for a customer.</p>;
  }
  const q = new URLSearchParams(link).toString();
  return (
    <section className={`no-print card p-5 ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-charcoal-700 uppercase">Forms</h2>
        <div className="flex flex-wrap gap-2">
          {forms.map((f) => (
            <Link key={f.id} href={`/forms/${f.id}/fill?${q}`} className="btn-outline py-1 text-xs">+ {f.name}</Link>
          ))}
        </div>
      </div>
      {submissions.length === 0 ? (
        <p className="text-sm text-charcoal-500">Nothing filled in yet.</p>
      ) : (
        <ul className="divide-y divide-charcoal-100 text-sm">
          {submissions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <Link href={`/forms/submissions/${s.id}`} className="font-medium text-kudu-700 hover:underline">
                {s.form.name}{s.summary && `: ${s.summary}`}
              </Link>
              <span className="text-xs text-charcoal-500">
                {s.source === "web" ? "Website" : s.submittedBy} · {fmtDateTime(s.createdAt)}
                {!s.reviewedAt && <span className="ml-2 rounded-full bg-kudu-600 px-1.5 font-semibold text-white">new</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
