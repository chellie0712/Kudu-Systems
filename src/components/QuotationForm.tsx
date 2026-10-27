import type { Customer, Quotation, QuotationItem, Settings } from "@prisma/client";
import { saveQuotation } from "@/app/actions/quotations";
import { addDays, toDateInput } from "@/lib/format";
import { LineItemsEditor } from "./LineItemsEditor";
import { Field, SectionTitle } from "./ui";

export function QuotationForm({
  quotation,
  customers,
  settings,
  customerId,
}: {
  quotation?: Quotation & { items: QuotationItem[] };
  customers: Pick<Customer, "id" | "name" | "siteAddress">[];
  settings: Settings;
  customerId?: string;
}) {
  const q = quotation;
  const today = new Date();
  return (
    <form action={saveQuotation} className="card space-y-6 p-6">
      {q && <input type="hidden" name="id" value={q.id} />}
      <section>
        <SectionTitle>Quotation</SectionTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Customer *" className="md:col-span-2">
            <select name="customerId" required className="input" defaultValue={q?.customerId ?? customerId ?? ""}>
              <option value="" disabled>Choose a customer…</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select name="status" className="input" defaultValue={q?.status ?? "DRAFT"}>
              {["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED"].map((s) => (
                <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </Field>
          <Field label="Title / subject" className="md:col-span-3">
            <input name="title" className="input" defaultValue={q?.title} placeholder="e.g. Quarterly service contract – main warehouse" />
          </Field>
          <Field label="Quote date">
            <input name="issueDate" type="date" className="input" defaultValue={toDateInput(q?.issueDate ?? today)} />
          </Field>
          <Field label="Valid until">
            <input name="validUntil" type="date" className="input" defaultValue={toDateInput(q?.validUntil ?? addDays(today, settings.quoteValidityDays))} />
          </Field>
          <Field label="Site address (if different from customer)">
            <input name="siteAddress" className="input" defaultValue={q?.siteAddress} />
          </Field>
        </div>
      </section>
      <section>
        <SectionTitle>Line items</SectionTitle>
        <LineItemsEditor
          initial={q?.items ?? []}
          vatRate={q?.vatRate ?? settings.vatRate}
          discount={q?.discount ?? 0}
          symbol={settings.currencySymbol}
        />
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <Field label="Notes to customer">
          <textarea name="notes" rows={4} className="input" defaultValue={q?.notes} />
        </Field>
        <Field label="Terms & conditions">
          <textarea name="terms" rows={4} className="input" defaultValue={q?.terms ?? settings.quoteTerms} />
        </Field>
      </section>
      <button className="btn-primary">Save quotation</button>
    </form>
  );
}
