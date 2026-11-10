import Link from "next/link";
import type { AppUser } from "@/auth";
import type { TenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import type { DocSubject } from "@/lib/documents/defs";
import { makeDocument } from "@/app/actions/documents";

type Link_ = { customerId: string } | { jobCardId: string } | { quotationId: string } | { invoiceId: string };

/**
 * Documents section for a customer, quotation, job card or invoice: what was made, and a
 * template picker to make another. `subject` is what new documents are made from.
 */
export async function LinkedDocuments({
  db,
  user,
  link,
  subject,
  subjectId,
  returnTo,
  className = "",
}: {
  db: TenantDb;
  user: AppUser;
  link: Link_;
  subject: DocSubject;
  subjectId: string;
  returnTo: string;
  className?: string;
}) {
  if (!can(user, "documents.create") && !can(user, "documents.view")) return null;
  const [templates, docs] = await Promise.all([
    can(user, "documents.create") ? db.docTemplate.findMany({ where: { active: true, appliesTo: subject }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
    db.generatedDoc.findMany({
      where: { ...link, ...(can(user, "documents.view") ? {} : "jobCardId" in link ? {} : { createdById: user.id }) },
      select: { id: true, number: true, name: true, createdAt: true, createdBy: true, clientSignedAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  if (!templates.length && !docs.length) return null;
  return (
    <section className={`no-print card p-5 ${className}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold tracking-wide text-charcoal-700 uppercase">Documents</h2>
        {templates.length > 0 && (
          <form action={makeDocument} className="flex items-center gap-1">
            <input type="hidden" name="subjectId" value={subjectId} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <select name="templateId" aria-label="Template" className="input w-auto py-1 text-xs" defaultValue={templates[0].id}>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="btn-outline py-1 text-xs">Make</button>
          </form>
        )}
      </div>
      {docs.length === 0 ? (
        <p className="text-sm text-charcoal-500">None made yet.</p>
      ) : (
        <ul className="divide-y divide-charcoal-100 text-sm">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <Link href={`/documents/${d.id}`} className="font-medium text-kudu-700 hover:underline">{d.name} {d.number}</Link>
              <span className="text-xs text-charcoal-500">
                {fmtDate(d.createdAt)} · {d.createdBy}
                {d.clientSignedAt && <span className="ml-2 rounded bg-emerald-100 px-1.5 font-semibold text-emerald-800">signed</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
