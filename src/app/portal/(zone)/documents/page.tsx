import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Empty } from "@/components/ui";

export const metadata = { title: "Documents" };

export default async function PortalDocuments() {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const rows = await db.generatedDoc.findMany({ where: { customerId: user.customerId, showInPortal: true }, orderBy: { createdAt: "desc" } });
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Certificates and documents</h1>
      <div className="card divide-y divide-charcoal-100">
        {rows.length === 0 && <Empty>No documents yet.</Empty>}
        {rows.map((d) => (
          <Link key={d.id} href={`/portal/documents/${d.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-charcoal-50">
            <span>
              <span className="font-semibold">{d.title || d.name}</span>
              <span className="block text-xs text-charcoal-500">{d.number}</span>
            </span>
            <span className="text-xs text-charcoal-500">{fmtDate(d.createdAt)}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
