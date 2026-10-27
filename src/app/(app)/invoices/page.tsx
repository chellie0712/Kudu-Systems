import Link from "next/link";
import { InvoiceStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";
import { Flash, PageHeader } from "@/components/ui";
import { InvoiceTable } from "@/components/DocTables";
import { StatusFilter } from "@/components/StatusFilter";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; msg?: string }> }) {
  await requireUser();
  const { status, q = "", msg } = await searchParams;
  const settings = await getSettings();
  const overdue = status === "OVERDUE";
  const rows = await db.invoice.findMany({
    where: {
      ...(overdue
        ? { status: { in: [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID] }, dueDate: { lt: new Date() } }
        : status && status in InvoiceStatus
          ? { status: status as InvoiceStatus }
          : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { reference: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { issueDate: "desc" },
    take: 300,
  });
  const outstanding = rows
    .filter((r) => r.status === "SENT" || r.status === "PARTIALLY_PAID")
    .reduce((s, r) => s + r.total - r.amountPaid, 0);
  return (
    <div>
      <PageHeader
        title="Invoices"
        subtitle={`Outstanding in this list: ${money(outstanding, settings.currencySymbol)}`}
        actions={<Link href="/invoices/new" className="btn-primary">+ New invoice</Link>}
      />
      <Flash message={msg} />
      <StatusFilter base="/invoices" current={status} q={q} statuses={[...Object.keys(InvoiceStatus), "OVERDUE"]} />
      <div className="card overflow-x-auto">
        <InvoiceTable rows={rows} symbol={settings.currencySymbol} />
      </div>
    </div>
  );
}
