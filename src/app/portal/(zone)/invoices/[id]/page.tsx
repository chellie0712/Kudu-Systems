import { notFound } from "next/navigation";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, money } from "@/lib/format";
import { isOverdueInvoice, portalInvoices } from "@/lib/portalData";
import { InvoiceSheet } from "@/components/DocSheets";
import { InvoiceBadge, PortalBack } from "@/components/Portal";
import { PrintButton } from "@/components/ConfirmButton";
import { SectionTitle } from "@/components/ui";

export const metadata = { title: "Invoice" };

export default async function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const { id } = await params;
  const [inv, settings] = await Promise.all([
    db.invoice.findFirst({
      where: { id, ...portalInvoices(user.customerId) },
      include: { customer: { include: { branch: true } }, contact: true, items: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { date: "asc" } } },
    }),
    getSettings(),
  ]);
  if (!inv) notFound();
  const sym = settings.currencySymbol;
  const balance = inv.total - inv.amountPaid;

  return (
    <div>
      <PortalBack href="/portal/invoices" label="Invoices" />
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-bold">Invoice {inv.number} <InvoiceBadge status={inv.status} overdue={isOverdueInvoice(inv)} /></h1>
        <PrintButton />
      </div>
      {balance > 0 && (
        <div className="no-print mb-4 rounded-md border border-charcoal-200 bg-white p-4 text-sm">
          <span className="font-semibold">{money(balance, sym)}</span> due by {fmtDate(inv.dueDate)}. Please pay by EFT using <span className="font-semibold">{inv.number}</span> as the reference; the banking details are at the bottom of the invoice.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <InvoiceSheet inv={inv} settings={settings} />
        <aside className="no-print card h-fit p-5">
          <SectionTitle>Payments received</SectionTitle>
          {inv.payments.length === 0 ? (
            <p className="text-sm text-charcoal-500">None yet.</p>
          ) : (
            <ul className="divide-y divide-charcoal-100 text-sm">
              {inv.payments.map((p) => (
                <li key={p.id} className="py-2">
                  <div className="font-medium">{money(p.amount, sym)}</div>
                  <div className="text-xs text-charcoal-500">{fmtDate(p.date)} · {p.method}</div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}
