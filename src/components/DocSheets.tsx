import type { Branch, Customer, Invoice, InvoiceItem, Quotation, QuotationItem, Settings } from "@prisma/client";
import { fmtDate } from "@/lib/format";
import { CustomerBlock, DocHeader, ItemsTable, TotalsBlock } from "@/components/Document";

type WithCustomer = { customer: Customer & { branch: Branch | null } };

/** The quotation as printed, shared by the staff quotation page and the customer portal. */
export function QuotationSheet({ q, settings }: { q: Quotation & WithCustomer & { items: QuotationItem[] }; settings: Settings }) {
  const sym = settings.currencySymbol;
  return (
    <article className="print-sheet card mx-auto max-w-4xl space-y-6 p-8">
      <DocHeader
        settings={settings}
        branch={q.customer.branch}
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
  );
}

/** The invoice as printed, with banking details, shared by the staff invoice page and the customer portal. */
export function InvoiceSheet({ inv, settings }: { inv: Invoice & WithCustomer & { items: InvoiceItem[] }; settings: Settings }) {
  const sym = settings.currencySymbol;
  return (
    <article className="print-sheet card w-full max-w-4xl space-y-6 p-8">
      <DocHeader
        settings={settings}
        branch={inv.customer.branch}
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
        extraRows={inv.amountPaid > 0 ? [["Paid", inv.amountPaid], ["Balance due", (inv.total - inv.amountPaid), true]] : []}
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
  );
}
