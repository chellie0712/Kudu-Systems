import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { TEMPLATES } from "@/lib/forms";
import { createForm } from "@/app/actions/forms";
import { Empty, Field, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Forms" };

export default async function FormsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("forms.fill");
  const db = await tenantDb();
  const { msg, err } = await searchParams;
  const manage = can(user, "forms.manage");
  const viewAll = can(user, "forms.view");
  const forms = await db.form.findMany({
    where: manage ? {} : viewAll ? { OR: [{ active: true, internal: true }, { public: true }] } : { active: true, internal: true },
    include: { _count: { select: { submissions: true } } },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  const [unread, recent] = viewAll
    ? await Promise.all([
        db.formSubmission.groupBy({ by: ["formId"], where: { reviewedAt: null }, _count: true }),
        db.formSubmission.findMany({ where: { reviewedAt: null }, include: { form: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 }),
      ])
    : [[], []];
  const mine = viewAll ? [] : await db.formSubmission.findMany({ where: { submittedById: user.id }, include: { form: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 10 });

  return (
    <div className="max-w-5xl">
      <PageHeader title="Forms" subtitle="Your own forms: inspection sheets and checklists filled in inside Kudu, and web forms for your website that bring in new leads." />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {recent.length > 0 && (
        <div className="card mb-6 p-5">
          <SectionTitle>New submissions</SectionTitle>
          <ul className="divide-y divide-charcoal-100 text-sm">
            {recent.map((s) => (
              <li key={s.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                <Link href={`/forms/submissions/${s.id}`} className="font-medium text-kudu-700 hover:underline">{s.form.name}{s.summary && `: ${s.summary}`}</Link>
                <span className="text-xs text-charcoal-500">{s.source === "web" ? "Website" : s.submittedBy} · {fmtDateTime(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mb-6 overflow-x-auto">
        {forms.length === 0 ? (
          <Empty>{manage ? "No forms yet. Start one below." : "No forms to fill in yet."}</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Form</th><th>Where</th>{viewAll && <th className="text-right">Submissions</th>}<th /></tr></thead>
            <tbody>
              {forms.map((f) => {
                const n = unread.find((u) => u.formId === f.id)?._count ?? 0;
                return (
                  <tr key={f.id} className={f.active ? "" : "opacity-60"}>
                    <td>
                      <div className="font-semibold">{f.name}{!f.active && <span className="ml-2 text-xs font-normal text-charcoal-500">(off)</span>}</div>
                      {f.description && <div className="text-xs text-charcoal-500">{f.description}</div>}
                    </td>
                    <td className="text-sm">
                      {[f.internal && (f.linkTo === "jobCard" ? "Job cards" : f.linkTo === "customer" ? "Customers" : "In Kudu"), f.public && "Website"].filter(Boolean).join(" · ")}
                    </td>
                    {viewAll && (
                      <td className="text-right text-sm">
                        <Link href={`/forms/${f.id}/submissions`} className="text-kudu-600 hover:underline">{f._count.submissions}</Link>
                        {n > 0 && <span className="ml-2 rounded-full bg-kudu-600 px-1.5 text-xs font-semibold text-white">{n} new</span>}
                      </td>
                    )}
                    <td className="text-right whitespace-nowrap">
                      {f.active && f.internal && !f.linkTo && <Link href={`/forms/${f.id}/fill`} className="btn-primary mr-2 py-1 text-xs">Fill in</Link>}
                      {manage && <Link href={`/forms/${f.id}/edit`} className="btn-outline py-1 text-xs">Edit</Link>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {forms.some((f) => f.linkTo) && <p className="-mt-4 mb-6 text-xs text-charcoal-500">Forms for job cards or customers are filled in from the job card or the customer&apos;s Forms tab.</p>}

      {mine.length > 0 && (
        <div className="card mb-6 p-5">
          <SectionTitle>Filled in by me</SectionTitle>
          <ul className="divide-y divide-charcoal-100 text-sm">
            {mine.map((s) => (
              <li key={s.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link href={`/forms/submissions/${s.id}`} className="text-kudu-700 hover:underline">{s.form.name}{s.summary && `: ${s.summary}`}</Link>
                <span className="text-xs text-charcoal-500">{fmtDateTime(s.createdAt)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {manage && (
        <form action={createForm} className="card p-5">
          <SectionTitle>New form</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Start from">
              <select name="template" className="input" defaultValue="quote-request">
                {TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.name}{t.public ? " (web form)" : ""}</option>)}
              </select>
            </Field>
            <Field label="Name (optional)" className="sm:col-span-2"><input name="name" className="input" placeholder="Leave blank to use the template's name" /></Field>
          </div>
          <button className="btn-primary mt-3">Create form</button>
        </form>
      )}
    </div>
  );
}
