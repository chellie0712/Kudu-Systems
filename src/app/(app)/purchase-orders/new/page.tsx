import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { poFormData } from "@/lib/purchasesServer";
import { Flash, PageHeader } from "@/components/ui";
import { PoForm } from "@/components/PurchaseOrders";

export const metadata = { title: "New purchase order" };

export default async function NewPoPage({ searchParams }: { searchParams: Promise<{ err?: string; itemId?: string }> }) {
  await requirePermission("purchases.edit");
  const db = await tenantDb();
  const [settings, data, sp] = await Promise.all([getSettings(), poFormData(db), searchParams]);
  const item = sp.itemId ? data.items.find((i) => i.id === sp.itemId) : undefined;
  const prefill = item ? [{ itemId: item.id, description: item.name, quantity: 1, unitCost: item.costPrice }] : [];
  return (
    <div className="max-w-5xl">
      <PageHeader title="New purchase order" back={{ href: "/purchase-orders", label: "Purchase orders" }} />
      <Flash message={sp.err} tone="error" />
      <PoForm prefill={prefill} {...data} vatRate={settings.vatRate} symbol={settings.currencySymbol} />
    </div>
  );
}
