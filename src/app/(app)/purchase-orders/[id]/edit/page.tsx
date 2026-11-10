import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { poFormData } from "@/lib/purchasesServer";
import { PO_EDITABLE } from "@/lib/purchases";
import { Flash, PageHeader } from "@/components/ui";
import { PoForm } from "@/components/PurchaseOrders";

export const metadata = { title: "Edit purchase order" };

export default async function EditPoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  await requirePermission("purchases.edit");
  const db = await tenantDb();
  const { id } = await params;
  const po = await db.purchaseOrder.findUnique({ where: { id }, include: { lines: true } });
  if (!po) notFound();
  if (!PO_EDITABLE.includes(po.status)) redirect(`/purchase-orders/${id}?err=An+ordered+purchase+order+can%27t+be+changed.`);
  const [settings, data, sp] = await Promise.all([getSettings(), poFormData(db), searchParams]);
  return (
    <div className="max-w-5xl">
      <PageHeader title={`Edit ${po.number}`} back={{ href: `/purchase-orders/${po.id}`, label: po.number }} />
      <Flash message={sp.err} tone="error" />
      {po.approvedAt && <Flash message="It is approved. If you change the total, it needs approving again." />}
      <PoForm po={po} {...data} vatRate={settings.vatRate} symbol={settings.currencySymbol} />
    </div>
  );
}
