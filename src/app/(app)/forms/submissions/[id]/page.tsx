import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/format";
import { answerText, parseFields, type Answers } from "@/lib/forms";
import { deleteSubmission, markSubmissionReviewed } from "@/app/actions/forms";
import { Flash, PageHeader } from "@/components/ui";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";

export const metadata = { title: "Form submission" };

export default async function SubmissionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("forms.fill");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const s = await db.formSubmission.findUnique({
    where: { id },
    include: { form: true, customer: { select: { id: true, name: true } }, jobCard: { select: { id: true, number: true } } },
  });
  // Without "See all submissions", only your own.
  if (!s || (!can(user, "forms.view") && s.submittedById !== user.id)) notFound();
  const [query, task] = await Promise.all([
    s.queryId ? db.query.findUnique({ where: { id: s.queryId }, select: { id: true, number: true } }) : null,
    s.taskId ? db.task.findUnique({ where: { id: s.taskId }, select: { id: true, number: true, assignedTo: { select: { name: true, email: true } } } }) : null,
  ]);
  const fields = parseFields(s.form.fields);
  const answers = (s.data ?? {}) as Answers;
  // Answers to fields that were since removed from the form are still shown.
  const extra = Object.keys(answers).filter((k) => !fields.some((f) => f.id === k));

  return (
    <div className="max-w-3xl">
      <PageHeader
        back={can(user, "forms.view") ? { href: `/forms/${s.formId}/submissions`, label: `${s.form.name} submissions` } : { href: "/forms", label: "Forms" }}
        title={s.form.name}
        subtitle={`${s.source === "web" ? "Sent in from the website" : `Filled in by ${s.submittedBy}`} · ${fmtDateTime(s.createdAt)}`}
        actions={<PrintButton />}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {(s.customer || s.jobCard || query || task) && (
        <div className="no-print card mb-4 flex flex-wrap gap-x-6 gap-y-1 p-4 text-sm">
          {s.customer && can(user, "customers.view") && <span>Customer: <Link href={`/customers/${s.customer.id}?tab=forms`} className="font-medium text-kudu-700 hover:underline">{s.customer.name}</Link></span>}
          {s.customer && !can(user, "customers.view") && <span>Customer: {s.customer.name}</span>}
          {s.jobCard && <span>Job card: <Link href={`/job-cards/${s.jobCard.id}`} className="font-medium text-kudu-700 hover:underline">{s.jobCard.number}</Link></span>}
          {query && can(user, "queries.view") && <span>Query: <Link href={`/queries/${query.id}`} className="font-medium text-kudu-700 hover:underline">{query.number}</Link></span>}
          {task && <span>Task: <Link href={`/tasks/${task.id}`} className="font-medium text-kudu-700 hover:underline">{task.number}</Link>{task.assignedTo ? ` (${task.assignedTo.name || task.assignedTo.email})` : " (nobody assigned)"}</span>}
        </div>
      )}
      <div className="card print-sheet p-6">
        <dl className="space-y-4">
          {fields.map((f) =>
            f.type === "heading" ? (
              <h3 key={f.id} className="border-b border-charcoal-200 pt-2 pb-1 text-lg font-bold">{f.label}</h3>
            ) : (
              <div key={f.id}>
                <dt className="text-xs font-semibold tracking-wide text-charcoal-500 uppercase">{f.label}</dt>
                <dd className="text-sm whitespace-pre-line">
                  {f.type === "signature" && typeof answers[f.id] === "string" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={answers[f.id] as string} alt="Signature" className="h-24 w-auto" />
                  ) : (
                    answerText(f, answers[f.id]) || <span className="text-charcoal-400">—</span>
                  )}
                </dd>
              </div>
            ),
          )}
          {extra.map((k) => (
            <div key={k}>
              <dt className="text-xs font-semibold tracking-wide text-charcoal-400 uppercase">Removed question</dt>
              <dd className="text-sm">{Array.isArray(answers[k]) ? (answers[k] as string[]).join(", ") : String(answers[k]).startsWith("data:") ? "(signed)" : String(answers[k])}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        {can(user, "forms.view") ? (
          <form action={markSubmissionReviewed} className="flex items-center gap-3">
            <input type="hidden" name="id" value={s.id} />
            {s.reviewedAt ? (
              <>
                <span className="text-charcoal-500">Dealt with by {s.reviewedBy} · {fmtDateTime(s.reviewedAt)}</span>
                <input type="hidden" name="undo" value="1" />
                <button className="text-charcoal-400 hover:text-kudu-600">Mark as new</button>
              </>
            ) : (
              <button className="btn-primary">Mark as dealt with</button>
            )}
          </form>
        ) : <span />}
        {can(user, "forms.delete") && (
          <form action={deleteSubmission}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmButton message="Delete this submission?" className="text-kudu-700 hover:underline">Delete</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
