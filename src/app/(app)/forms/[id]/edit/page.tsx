import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { currentCompany, tenantDb } from "@/lib/db";
import { parseFields } from "@/lib/forms";
import { TASK_CATEGORIES } from "@/lib/tasks";
import { siteUrl } from "@/lib/email/links";
import { deleteForm, saveForm } from "@/app/actions/forms";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { FormBuilder } from "@/components/FormBuilder";

export const metadata = { title: "Edit form" };

export default async function EditFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("forms.manage");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const form = await db.form.findUnique({ where: { id }, include: { _count: { select: { submissions: true } } } });
  if (!form) notFound();
  const fields = parseFields(form.fields);
  const url = `${await siteUrl()}/f/${(await currentCompany()).company.slug}/${form.slug}`;
  const check = (name: string, on: boolean, label: string, hint?: string) => (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={on} className="mt-0.5 h-4 w-4 accent-kudu-600" />
      <span>{label}{hint && <span className="block text-xs text-charcoal-500">{hint}</span>}</span>
    </label>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/forms", label: "Forms" }}
        title={`Edit ${form.name}`}
        actions={
          <>
            {form.internal && !form.linkTo && <Link href={`/forms/${form.id}/fill`} className="btn-outline">Try it</Link>}
            {form.public && <a href={url} target="_blank" rel="noreferrer" className="btn-outline">Open web form</a>}
            <Link href={`/forms/${form.id}/submissions`} className="btn-outline">Submissions ({form._count.submissions})</Link>
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {form.public && form.active && (
        <div className="card mb-6 space-y-2 border-l-4 border-l-kudu-600 p-5 text-sm">
          <div className="font-semibold">Web form address</div>
          <input readOnly value={url} className="input font-mono text-xs" aria-label="Web form address" />
          <div className="font-semibold">To put it on your website, paste this where the form should go</div>
          <textarea
            readOnly
            rows={2}
            className="input font-mono text-xs"
            aria-label="Embed code"
            value={`<iframe src="${url}?embed=1" style="width:100%;min-height:900px;border:0" title="${form.name.replace(/"/g, "&quot;")}"></iframe>`}
          />
          <p className="text-xs text-charcoal-500">Or link a button on your website, Facebook page or Google Business profile to the address.</p>
        </div>
      )}

      <form action={saveForm} className="space-y-6">
        <input type="hidden" name="id" value={form.id} />
        <div className="card grid gap-4 p-5 sm:grid-cols-2">
          <SectionTitle>Form</SectionTitle>
          <div className="hidden sm:block" />
          <Field label="Name *"><input name="name" required defaultValue={form.name} className="input" /></Field>
          <Field label="Web address name"><input name="slug" defaultValue={form.slug} className="input" /></Field>
          <Field label="Text at the top" className="sm:col-span-2"><textarea name="description" rows={2} defaultValue={form.description} className="input" /></Field>
          <div className="space-y-2 sm:col-span-2">
            {check("active", form.active, "Switched on", "When off, nobody can fill it in; submissions are kept.")}
            {check("internal", form.internal, "Filled in by staff inside Kudu")}
          </div>
          <Field label="Staff fill it in for">
            <select name="linkTo" defaultValue={form.linkTo} className="input">
              <option value="">Nothing in particular (from Forms)</option>
              <option value="customer">A customer (from the customer&apos;s Forms tab)</option>
              <option value="jobCard">A job card (from the job card)</option>
            </select>
          </Field>
        </div>

        <div className="card space-y-3 p-5">
          <SectionTitle>Web form</SectionTitle>
          {check("public", form.public, "Publish as a web form anyone can fill in", "No sign-in needed. Protected against spam bots (hidden trap field, time check, at most 10 per hour from one connection).")}
          <Field label="Message after sending"><input name="thankYou" defaultValue={form.thankYou} className="input" /></Field>
          <div className="space-y-2">
            {check("createCustomer", form.createCustomer, "Find the customer by email or phone, or add them as a new customer (lead source “Website”)", "Uses the answers you point at customer details below.")}
            {check("createQuery", form.createQuery, "Log a customer query with the answers")}
            {check("createTask", form.createTask, "Add a follow-up task due in 24 hours, handed out by the task assignment rules")}
          </div>
          <Field label="Task type (for the assignment rules)" className="max-w-xs">
            <input name="taskCategory" list="form-task-categories" defaultValue={form.taskCategory} className="input" />
            <datalist id="form-task-categories">{TASK_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
          </Field>
        </div>

        <div className="card p-5">
          <SectionTitle>Fields</SectionTitle>
          <p className="mb-3 text-sm text-charcoal-500">Click a field to change it. Drag by the ⠿ handle, or use the arrows, to change the order.</p>
          <FormBuilder initial={fields} showMapping />
        </div>
        <button className="btn-primary">Save form</button>
      </form>

      <form action={deleteForm} className="mt-8 text-right">
        <input type="hidden" name="id" value={form.id} />
        <ConfirmButton message={`Delete “${form.name}” and its ${form._count.submissions} submission(s)? Switch it off instead to keep them.`} className="text-sm text-kudu-700 hover:underline">Delete form</ConfirmButton>
      </form>
    </div>
  );
}
