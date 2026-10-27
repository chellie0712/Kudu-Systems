import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate } from "@/lib/format";
import {
  createInvoiceFromQuotation,
  createJobCardFromQuotation,
  deleteQuotation,
  setQuotationStatus,
} from "@/app/actions/quotations";
import { Flash, PageHeader, StatusBadge } from "@/components/ui";
import { CustomerBlock, DocHeader, ItemsTable, TotalsBlock } from "@/components/Document";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";

export default async function QuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [q, settings] = await Promise.all([
    db.quotation.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
        jobCards: { select: { id: true, number: true, status: true } },
        invoices: { select: { id: true, number: true, status: true } },
      },
    }),
    getSettings(),
  ]);
  if (!q) notFound();
  const sym = settings.currencySymbol;

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

      <article className="print-sheet card mx-auto max-w-4xl space-y-6 p-8">
        <DocHeader
          settings={settings}
          docType="Quotation"
          number={q.number}
          meta={[
            ["Date", fmtDate(q.issueDate)],
            ["Valid until", fmtDate(q.validUntil)],
          ]}
        />
        <div className="grid gap-6 sm:grid-cols-2">
          <CustomerBlock customer={q.customer} title="Quotation for" />
          {(q.siteAddress || q.customer.siteAddress) && (
            <div>
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-kudu-600">Site</div>
              <div className="whitespace-pre-line text-sm">{q.siteAddress || q.customer.siteAddress}</div>
            </div>
          )}
        </div>
        {q.title && <h2 className="text-lg font-semibold">{q.title}</h2>}
        <ItemsTable items={q.items} symbol={sym} />
        <TotalsBlock doc={q} symbol={sym} />
        {q.notes && (
          <div>
            <div className="label">Notes</div>
            <p className="whitespace-pre-line text-sm">{q.notes}</p>
          </div>
        )}
        {q.terms && (
          <div className="border-t border-charcoal-100 pt-4">
            <div className="label">Terms & conditions</div>
            <p className="whitespace-pre-line text-xs text-charcoal-600">{q.terms}</p>
          </div>
        )}
        <div className="grid gap-8 pt-6 sm:grid-cols-2">
          <div className="border-t border-charcoal-400 pt-1 text-xs text-charcoal-500">Accepted by (name & signature)</div>
          <div className="border-t border-charcoal-400 pt-1 text-xs text-charcoal-500">Date</div>
        </div>
      </article>

      <form action={deleteQuotation} className="no-print mx-auto mt-6 max-w-4xl text-right">
        <input type="hidden" name="id" value={q.id} />
        <ConfirmButton message={`Delete quotation ${q.number}? Linked job cards and invoices are kept.`}>Delete quotation</ConfirmButton>
      </form>
    </div>
  );
}
