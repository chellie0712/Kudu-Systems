import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, money } from "@/lib/format";
import { isOverdueInvoice, portalInvoices } from "@/lib/portalData";
import { InvoiceBadge } from "@/components/Portal";
import { Empty } from "@/components/ui";

export const metadata = { title: "Invoices" };

export default async function PortalInvoices() {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const settings = await getSettings();
  const sym = settings.currencySymbol;
  const rows = await db.invoice.findMany({ where: portalInvoices(user.customerId), orderBy: { issueDate: "desc" } });
  const now = new Date();
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Invoices</h1>
      <div className="card divide-y divide-charcoal-100">
        {rows.length === 0 && <Empty>No invoices yet.</Empty>}
        {rows.map((i) => (
          <Link key={i.id} href={`/portal/invoices/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-charcoal-50">
            <span>
              <span className="font-semibold">{i.number}</span>
              <span className="block text-xs text-charcoal-500">{fmtDate(i.issueDate)} · due {fmtDate(i.dueDate)}</span>
            </span>
            <span className="flex items-center gap-3 text-right">
              <span className="tabular-nums">
                <span className="font-semibold">{money(i.total, sym)}</span>
                {i.status !== "PAID" && i.amountPaid > 0 && <span className="block text-xs text-charcoal-500">{money(i.total - i.amountPaid, sym)} left</span>}
              </span>
              <InvoiceBadge status={i.status} overdue={isOverdueInvoice(i, now)} />
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
