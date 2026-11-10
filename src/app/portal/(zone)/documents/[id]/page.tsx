import { notFound } from "next/navigation";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PortalBack } from "@/components/Portal";
import { PrintButton } from "@/components/ConfirmButton";
import { GeneratedDocSheet } from "@/components/GeneratedDocSheet";

export const metadata = { title: "Document" };

export default async function PortalDocument({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const { id } = await params;
  const [doc, settings] = await Promise.all([db.generatedDoc.findFirst({ where: { id, customerId: user.customerId, showInPortal: true } }), getSettings()]);
  if (!doc) notFound();
  return (
    <div>
      <PortalBack href="/portal/documents" label="Documents" />
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{doc.title || doc.name}</h1>
        <PrintButton />
      </div>
      <GeneratedDocSheet doc={doc} settings={settings} />
    </div>
  );
}
