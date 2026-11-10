import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { Empty, Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Documents" };

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string; err?: string }> }) {
  const user = await requirePermission("documents.view");
  const db = await tenantDb();
  const { q = "", msg, err } = await searchParams;
  const term = q.trim();
  const docs = await db.generatedDoc.findMany({
    where: term
      ? { OR: [{ number: { contains: term, mode: "insensitive" } }, { name: { contains: term, mode: "insensitive" } }, { customer: { name: { contains: term, mode: "insensitive" } } }] }
      : {},
    include: { customer: { select: { name: true } }, jobCard: { select: { number: true } }, quotation: { select: { number: true } }, invoice: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Documents"
        subtitle="Certificates, agreements and letters made from your templates. Make new ones from a job card, quotation, invoice or customer."
        actions={can(user, "documents.templates") ? <Link href="/documents/templates" className="btn-outline">Templates</Link> : undefined}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} className="input" placeholder="Search by number, template or customer" aria-label="Search" />
        <button className="btn-outline">Search</button>
      </form>
      <div className="card overflow-x-auto">
        {docs.length === 0 ? (
          <Empty>{term ? "Nothing matches." : "No documents yet."}</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Document</th><th>Customer</th><th>For</th><th>Made</th><th>Signed</th></tr></thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td><Link href={`/documents/${d.id}`} className="font-semibold text-kudu-700 hover:underline">{d.number}</Link><div className="text-xs text-charcoal-500">{d.name}</div></td>
                  <td className="text-sm">{d.customer.name}</td>
                  <td className="text-sm">{d.jobCard?.number ?? d.quotation?.number ?? d.invoice?.number ?? ""}</td>
                  <td className="text-sm whitespace-nowrap">{fmtDate(d.createdAt)}<div className="text-xs text-charcoal-500">{d.createdBy}</div></td>
                  <td className="text-sm">{d.clientSignedAt ? `${d.clientSignedName}, ${fmtDate(d.clientSignedAt)}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
