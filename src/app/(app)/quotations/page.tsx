import Link from "next/link";
import { QuotationStatus } from "@prisma/client";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Flash, PageHeader } from "@/components/ui";
import { QuotationTable } from "@/components/DocTables";
import { StatusFilter } from "@/components/StatusFilter";

export const metadata = { title: "Quotations" };

export default async function QuotationsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; msg?: string }> }) {
  await requireUser();
  const { status, q = "", msg } = await searchParams;
  const settings = await getSettings();
  const rows = await db.quotation.findMany({
    where: {
      ...(status && status in QuotationStatus ? { status: status as QuotationStatus } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { issueDate: "desc" },
    take: 300,
  });
  return (
    <div>
      <PageHeader title="Quotations" actions={<Link href="/quotations/new" className="btn-primary">+ New quotation</Link>} />
      <Flash message={msg} />
      <StatusFilter base="/quotations" current={status} q={q} statuses={Object.keys(QuotationStatus)} />
      <div className="card overflow-x-auto">
        <QuotationTable rows={rows} symbol={settings.currencySymbol} />
      </div>
    </div>
  );
}
