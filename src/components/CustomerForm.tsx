import type { Customer } from "@prisma/client";
import { saveCustomer } from "@/app/actions/customers";
import { Field, SectionTitle } from "./ui";

export function CustomerForm({
  customer,
  branches = [],
  defaultBranchId,
}: {
  customer?: Customer;
  branches?: { id: string; name: string }[];
  defaultBranchId?: string | null;
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
          <Field label="Contact person">
            <input name="contactPerson" className="input" defaultValue={c?.contactPerson} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" className="input" defaultValue={c?.email} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" className="input" defaultValue={c?.phone} />
          </Field>
          <Field label="Alternative phone">
            <input name="altPhone" type="tel" className="input" defaultValue={c?.altPhone} />
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
