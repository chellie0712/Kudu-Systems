import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, money, toDateInput } from "@/lib/format";
import { deleteInvoice, deletePayment, recordPayment, setInvoiceStatus } from "@/app/actions/invoices";
import { Field, Flash, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { CustomerBlock, DocHeader, ItemsTable, TotalsBlock } from "@/components/Document";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";
import { invoiceDisplayStatus } from "@/components/DocTables";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [inv, settings] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        customer: true,
        items: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { date: "asc" } },
        quotation: { select: { id: true, number: true } },
        jobCard: { select: { id: true, number: true } },
      },
    }),
    getSettings(),
  ]);
  if (!inv) notFound();
  const sym = settings.currencySymbol;
  const balance = inv.total - inv.amountPaid;
  const status = invoiceDisplayStatus(inv);

  return (
    <div>
      <PageHeader
        back={{ href: `/customers/${inv.customerId}?tab=invoices`, label: inv.customer.name }}
        title={<span className="flex items-center gap-3">{inv.number} <StatusBadge status={status} /></span>}
        subtitle={`Balance due ${money(balance, sym)} · due ${fmtDate(inv.dueDate)}`}
        actions={
          <>
            <Link href={`/invoices/${inv.id}/edit`} className="btn-primary">Edit</Link>
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        {inv.status === "DRAFT" && (
          <form action={setInvoiceStatus}>
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="status" value="SENT" />
            <button className="btn-outline py-1 text-xs">Mark as sent</button>
          </form>
        )}
        {inv.status !== "CANCELLED" && (
          <form action={setInvoiceStatus}>
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <ConfirmButton message="Cancel this invoice?" className="btn-outline py-1 text-xs">Cancel invoice</ConfirmButton>
          </form>
        )}
        <span className="ml-auto flex gap-3">
          {inv.quotation && <Link href={`/quotations/${inv.quotation.id}`} className="text-kudu-600 hover:underline">Quotation {inv.quotation.number}</Link>}
          {inv.jobCard && <Link href={`/job-cards/${inv.jobCard.id}`} className="text-kudu-600 hover:underline">Job card {inv.jobCard.number}</Link>}
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <article className="print-sheet card w-full max-w-4xl space-y-6 p-8">
          <DocHeader
            settings={settings}
            docType={settings.vatNumber ? "Tax Invoice" : "Invoice"}
            number={inv.number}
            meta={[
              ["Date", fmtDate(inv.issueDate)],
              ["Due date", fmtDate(inv.dueDate)],
              ...(inv.reference ? ([["Reference", inv.reference]] as [string, string][]) : []),
            ]}
          />
          <CustomerBlock customer={inv.customer} />
          <ItemsTable items={inv.items} symbol={sym} />
          <TotalsBlock
            doc={inv}
            symbol={sym}
            extraRows={inv.amountPaid > 0 ? [["Paid", inv.amountPaid], ["Balance due", balance, true]] : []}
          />
          {inv.notes && (
            <div>
              <div className="label">Notes</div>
              <p className="whitespace-pre-line text-sm">{inv.notes}</p>
            </div>
          )}
          {(settings.bankName || settings.bankAccountNumber) && (
            <div className="rounded-md bg-charcoal-50 p-4 text-sm">
              <div className="mb-1 text-xs font-bold uppercase tracking-wide text-kudu-600">Banking details</div>
              <div>Bank: {settings.bankName}</div>
              <div>Account name: {settings.bankAccountName}</div>
              <div>Account no.: {settings.bankAccountNumber}</div>
              <div>Branch code: {settings.bankBranchCode}</div>
              <div>Reference: {inv.number}</div>
            </div>
          )}
          {inv.terms && <p className="whitespace-pre-line border-t border-charcoal-100 pt-4 text-xs text-charcoal-600">{inv.terms}</p>}
        </article>

        <aside className="no-print space-y-6">
          <div className="card p-5">
            <SectionTitle>Payments</SectionTitle>
            {inv.payments.length === 0 ? (
              <p className="text-sm text-charcoal-500">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-charcoal-100 text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium">{money(p.amount, sym)}</div>
                      <div className="text-xs text-charcoal-500">{fmtDate(p.date)} · {p.method}{p.reference && ` · ${p.reference}`}</div>
                    </div>
                    <form action={deletePayment}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton message="Remove this payment?" className="text-xs text-charcoal-400 hover:text-kudu-600">Remove</ConfirmButton>
                    </form>
                  </li>
                ))}
              </ul>
            )}
            {inv.status !== "CANCELLED" && balance > 0 && (
              <form action={recordPayment} className="mt-4 space-y-3 border-t border-charcoal-100 pt-4">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <Field label="Amount"><input name="amount" inputMode="decimal" className="input" defaultValue={(balance / 100).toFixed(2)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><input name="date" type="date" className="input" defaultValue={toDateInput(new Date())} /></Field>
                  <Field label="Method">
                    <select name="method" className="input">
                      {["EFT", "Cash", "Card", "Cheque", "Other"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Reference"><input name="reference" className="input" /></Field>
                <button className="btn-primary w-full">Record payment</button>
              </form>
            )}
          </div>
          <form action={deleteInvoice} className="text-right">
            <input type="hidden" name="id" value={inv.id} />
            <ConfirmButton message={`Delete invoice ${inv.number} and its payments? Consider cancelling instead to keep your numbering intact.`}>
              Delete invoice
            </ConfirmButton>
          </form>
        </aside>
      </div>
    </div>
  );
}
