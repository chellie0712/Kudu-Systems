import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import {
  createInvoiceFromQuotation,
  createJobCardFromQuotation,
  deleteQuotation,
  setQuotationStatus,
} from "@/app/actions/quotations";
import { Flash, PageHeader, StatusBadge } from "@/components/ui";
import { QuotationSheet } from "@/components/DocSheets";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";

export default async function QuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const user = await requirePermission("quotations.view");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [q, settings] = await Promise.all([
    db.quotation.findUnique({
      where: { id },
      include: {
        customer: { include: { branch: true } },
        items: { orderBy: { sortOrder: "asc" } },
        jobCards: { select: { id: true, number: true, status: true } },
        invoices: { select: { id: true, number: true, status: true } },
      },
    }),
    getSettings(),
  ]);
  if (!q) notFound();

  return (
    <div>
      <PageHeader
        back={{ href: `/customers/${q.customerId}?tab=quotations`, label: q.customer.name }}
        title={<span className="flex items-center gap-3">{q.number} <StatusBadge status={q.status} /></span>}
        subtitle={q.title}
        actions={
          <>
            <form action={createJobCardFromQuotation}>
              <input type="hidden" name="id" value={q.id} />
              <button className="btn-primary">Create job card</button>
            </form>
            <form action={createInvoiceFromQuotation}>
              <input type="hidden" name="id" value={q.id} />
              <button className="btn-dark">Create invoice</button>
            </form>
            <Link href={`/quotations/${q.id}/edit`} className="btn-outline">Edit</Link>
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {q.respondedAt && (
        <div className={`no-print mb-4 rounded-md border p-3 text-sm ${q.response === "ACCEPTED" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-charcoal-200 bg-white"}`}>
          <span className="font-semibold">{q.response === "DECLINED" ? "Declined" : "Accepted"} online</span> by {q.respondedBy} on {fmtDateTime(q.respondedAt)} in the customer portal.
          {q.responseNote && <span className="mt-1 block whitespace-pre-line italic">“{q.responseNote}”</span>}
        </div>
      )}

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-charcoal-500">Mark as:</span>
        {(["SENT", "ACCEPTED", "DECLINED", "EXPIRED"] as const)
          .filter((s) => s !== q.status)
          .map((s) => (
            <form key={s} action={setQuotationStatus}>
              <input type="hidden" name="id" value={q.id} />
              <input type="hidden" name="status" value={s} />
              <button className="btn-outline py-1 text-xs">{s.charAt(0) + s.slice(1).toLowerCase()}</button>
            </form>
          ))}
        {(q.jobCards.length > 0 || q.invoices.length > 0) && (
          <span className="ml-auto flex flex-wrap gap-3">
            {q.jobCards.map((j) => (
              <Link key={j.id} href={`/job-cards/${j.id}`} className="text-kudu-600 hover:underline">Job card {j.number}</Link>
            ))}
            {q.invoices.map((i) => (
              <Link key={i.id} href={`/invoices/${i.id}`} className="text-kudu-600 hover:underline">Invoice {i.number}</Link>
            ))}
          </span>
        )}
      </div>

      <QuotationSheet q={q} settings={settings} />

      {can(user.role, "quotations.delete") && (
        <form action={deleteQuotation} className="no-print mx-auto mt-6 max-w-4xl text-right">
          <input type="hidden" name="id" value={q.id} />
          <ConfirmButton message={`Delete quotation ${q.number}? Linked job cards and invoices are kept.`}>Delete quotation</ConfirmButton>
        </form>
      )}
    </div>
  );
}
