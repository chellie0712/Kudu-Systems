import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { DOC_SUBJECTS, STARTERS, type DocSubject } from "@/lib/documents/defs";
import { createTemplate } from "@/app/actions/documents";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Document templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("documents.templates");
  const db = await tenantDb();
  const { msg, err } = await searchParams;
  const templates = await db.docTemplate.findMany({ include: { _count: { select: { documents: true } } }, orderBy: [{ active: "desc" }, { name: "asc" }] });
  const names = new Set(templates.map((t) => t.name));
  return (
    <div className="max-w-5xl">
      <PageHeader back={{ href: "/documents", label: "Documents" }} title="Document templates" subtitle="Write a document once, with fields like the customer's name or the job date; Kudu fills them in each time one is made." />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <div className="card mb-6 overflow-x-auto">
        {templates.length === 0 ? (
          <Empty>No templates yet. Start from one below.</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Template</th><th>Made from</th><th>Numbers</th><th className="text-right">Made</th></tr></thead>
            <tbody>
              {templates.map((t) => (
                <tr key={t.id} className={t.active ? "" : "opacity-60"}>
                  <td>
                    <Link href={`/documents/templates/${t.id}`} className="font-semibold text-kudu-700 hover:underline">{t.name}</Link>
                    {!t.active && <span className="ml-2 text-xs text-charcoal-500">(off)</span>}
                    {t.showInPortal && <div className="text-xs text-charcoal-500">Shown in the customer portal</div>}
                  </td>
                  <td className="text-sm">{DOC_SUBJECTS[t.appliesTo as DocSubject] ?? t.appliesTo}</td>
                  <td className="text-sm font-mono">{t.prefix}{String(t.nextNo).padStart(4, "0")}</td>
                  <td className="text-right text-sm">{t._count.documents}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card p-5">
        <SectionTitle>Add a template</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {STARTERS.map((s) => (
            <form key={s.key} action={createTemplate} className="flex items-center justify-between gap-3 rounded-md border border-charcoal-200 p-3">
              <input type="hidden" name="starter" value={s.key} />
              <div>
                <div className="font-semibold">{s.name}</div>
                <div className="text-xs text-charcoal-500">Made from a {DOC_SUBJECTS[s.appliesTo].toLowerCase()}</div>
              </div>
              <button className="btn-outline py-1 text-xs">{names.has(s.name) ? "Add another" : "Use this"}</button>
            </form>
          ))}
          <form action={createTemplate} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-charcoal-300 p-3">
            <div className="font-semibold">Blank template</div>
            <button className="btn-primary py-1 text-xs">Start blank</button>
          </form>
        </div>
      </div>
    </div>
  );
}
