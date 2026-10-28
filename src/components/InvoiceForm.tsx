import type { Customer, Invoice, InvoiceItem, JobCard, Settings } from "@prisma/client";
import { saveInvoice } from "@/app/actions/invoices";
import { addDays, toDateInput } from "@/lib/format";
import { LineItemsEditor } from "./LineItemsEditor";
import { Field, SectionTitle } from "./ui";

export function InvoiceForm({
  invoice,
  customers,
  jobCards,
  settings,
  customerId,
}: {
  invoice?: Invoice & { items: InvoiceItem[] };
  customers: Pick<Customer, "id" | "name">[];
  jobCards: (Pick<JobCard, "id" | "number" | "customerId">)[];
  settings: Settings;
  customerId?: string;
}) {
  const inv = invoice;
  const today = new Date();
  return (
    <form action={saveInvoice} className="card space-y-6 p-6">
      {inv && <input type="hidden" name="id" value={inv.id} />}
      <section>
        <SectionTitle>Invoice</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Customer *" className="md:col-span-2">
            <select name="customerId" required className="input" defaultValue={inv?.customerId ?? customerId ?? ""}>
              <option value="" disabled>Choose a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" className="input" defaultValue={inv?.status ?? "DRAFT"}>
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="CANCELLED">Cancelled</option>
              {inv && (inv.status === "PAID" || inv.status === "PARTIALLY_PAID") && (
                <option value={inv.status}>{inv.status.replace("_", " ").toLowerCase()} (set by payments)</option>
              )}
            </select>
          </Field>
          <Field label="Invoice date">
            <input name="issueDate" type="date" className="input" defaultValue={toDateInput(inv?.issueDate ?? today)} />
          </Field>
          <Field label="Due date">
            <input name="dueDate" type="date" className="input" defaultValue={toDateInput(inv?.dueDate ?? addDays(today, settings.invoiceDueDays))} />
          </Field>
          <Field label="Customer reference / order no.">
            <input name="reference" className="input" defaultValue={inv?.reference} />
          </Field>
          <Field label="Linked job card" className="md:col-span-3">
            <select name="jobCardId" className="input" defaultValue={inv?.jobCardId ?? ""}>
              <option value="">— None —</option>
              {jobCards.map((j) => <option key={j.id} value={j.id}>{j.number}</option>)}
            </select>
          </Field>
        </div>
      </section>
      <section>
        <SectionTitle>Line items</SectionTitle>
        <LineItemsEditor initial={inv?.items ?? []} vatRate={inv?.vatRate ?? settings.vatRate} discount={inv?.discount ?? 0} symbol={settings.currencySymbol} />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Notes to customer">
          <textarea name="notes" rows={4} className="input" defaultValue={inv?.notes} />
        </Field>
        <Field label="Payment terms">
          <textarea name="terms" rows={4} className="input" defaultValue={inv?.terms ?? settings.invoiceTerms} />
        </Field>
      </section>
      <button className="btn-primary">Save invoice</button>
    </form>
  );
}
