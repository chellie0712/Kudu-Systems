import type { Customer } from "@prisma/client";
import { saveCustomer } from "@/app/actions/customers";
import { LEAD_SOURCES } from "@/lib/marketing";
import { Field, SectionTitle } from "./ui";

export function CustomerForm({
  customer,
  branches = [],
  defaultBranchId,
  campaigns = [],
}: {
  customer?: Customer;
  branches?: { id: string; name: string }[];
  defaultBranchId?: string | null;
  campaigns?: string[];
}) {
  const c = customer;
  return (
    <form action={saveCustomer} className="card max-w-4xl space-y-6 p-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <section>
        <SectionTitle>Customer details</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Customer type">
            <select name="type" className="input" defaultValue={c?.type ?? "BUSINESS"}>
              <option value="BUSINESS">Business</option>
              <option value="INDIVIDUAL">Individual / household</option>
            </select>
          </Field>
          <Field label="Name (company or full name) *">
            <input name="name" required className="input" defaultValue={c?.name} />
          </Field>
          <Field label="VAT number">
            <input name="vatNumber" className="input" defaultValue={c?.vatNumber} />
          </Field>
          <Field label="Company registration no.">
            <input name="regNumber" className="input" defaultValue={c?.regNumber} />
          </Field>
          {branches.length > 0 && (
            <Field label="Branch">
              <select name="branchId" className="input" defaultValue={(c ? c.branchId : defaultBranchId) ?? ""}>
                <option value="">No branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      </section>
      <section>
        <SectionTitle>Primary contact</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Contact person">
            <input name="contactPerson" className="input" defaultValue={c?.contactPerson} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className="input" defaultValue={c?.email} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" className="input" defaultValue={c?.phone} />
          </Field>
          <Field label="Mobile / alternative phone">
            <input name="altPhone" type="tel" className="input" defaultValue={c?.altPhone} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-charcoal-500">
          The person quotations, job cards and invoices go to unless you pick someone else. Add more people on the customer&apos;s Contacts tab.
        </p>
      </section>
      <section>
        <SectionTitle>How they found you</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Lead source">
            <select name="leadSource" className="input" defaultValue={c?.leadSource ?? ""}>
              <option value="">Not recorded</option>
              {LEAD_SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
              {c?.leadSource && !(LEAD_SOURCES as readonly string[]).includes(c.leadSource) && <option value={c.leadSource}>{c.leadSource}</option>}
            </select>
          </Field>
          <Field label="Ad campaign (if from an ad)">
            <input name="leadCampaign" list="ad-campaigns" className="input" defaultValue={c?.leadCampaign} placeholder="Pick or type the campaign name" />
            <datalist id="ad-campaigns">{campaigns.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
        </div>
        <p className="mt-2 text-xs text-charcoal-500">Used by the Marketing report to work out cost per lead and cost per won customer for each campaign.</p>
      </section>
      <section>
        <SectionTitle>Addresses</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Billing / postal address">
            <textarea name="billingAddress" rows={4} className="input" defaultValue={c?.billingAddress} />
          </Field>
          <Field label="Site / service address">
            <textarea name="siteAddress" rows={4} className="input" defaultValue={c?.siteAddress} placeholder="Where the work is done, if different" />
          </Field>
        </div>
      </section>
      <section>
        <SectionTitle>Notes</SectionTitle>
        <textarea name="notes" rows={4} className="input" defaultValue={c?.notes} placeholder="Access instructions, gate codes, preferences…" />
      </section>
      <div className="flex gap-2">
        <button className="btn-primary">Save customer</button>
      </div>
    </form>
  );
}
