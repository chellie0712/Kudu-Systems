import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import type { DocSubject } from "@/lib/documents/defs";
import { deleteTemplate, saveTemplate } from "@/app/actions/documents";
import { Field, Flash, PageHeader } from "@/components/ui";
import { ConfirmButton } from "@/components/ConfirmButton";
import { TemplateEditor } from "@/components/TemplateEditor";

export const metadata = { title: "Edit template" };

export default async function TemplatePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("documents.templates");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [t, settings] = await Promise.all([db.docTemplate.findUnique({ where: { id } }), getSettings()]);
  if (!t) notFound();
  return (
    <div className="max-w-6xl">
      <PageHeader back={{ href: "/documents/templates", label: "Templates" }} title={t.name} />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <form action={saveTemplate} className="space-y-4">
        <input type="hidden" name="id" value={t.id} />
        <div className="card space-y-3 p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name *" className="sm:col-span-2"><input name="name" required defaultValue={t.name} className="input" /></Field>
            <Field label="Number starts with"><input name="prefix" defaultValue={t.prefix} className="input font-mono" /></Field>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={t.active} /> Switched on (can be made)</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="letterhead" defaultChecked={t.letterhead} /> Print your logo and details at the top</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="showInPortal" defaultChecked={t.showInPortal} /> Customers see it in the customer portal</label>
          </div>
        </div>
        <div className="card p-5">
          <TemplateEditor initial={{ appliesTo: t.appliesTo as DocSubject, title: t.title, body: t.body }} companyName={settings.companyName} />
        </div>
        <button className="btn-primary">Save template</button>
      </form>
      <form action={deleteTemplate} className="mt-6 text-right">
        <input type="hidden" name="id" value={t.id} />
        <ConfirmButton message={`Delete the template “${t.name}”? Documents already made from it are kept.`} className="text-sm text-kudu-600 hover:underline">Delete template</ConfirmButton>
      </form>
    </div>
  );
}
