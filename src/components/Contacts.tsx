import type { CustomerContact } from "@prisma/client";
import { deleteContact, makeContactPrimary, saveContact, setContactArchived } from "@/app/actions/contacts";
import { contactLabel } from "@/lib/contacts";
import { ConfirmButton } from "./ConfirmButton";
import { Empty, Field, SectionTitle } from "./ui";

type Row = CustomerContact & { _count: { quotations: number; jobCards: number; invoices: number } };

function ContactFields({ c }: { c?: CustomerContact }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Name">
        <input name="name" className="input" defaultValue={c?.name} placeholder="e.g. Thandi Mokoena" />
      </Field>
      <Field label="Role / title">
        <input name="role" className="input" defaultValue={c?.role} placeholder="e.g. Facilities manager, Accounts" list="contact-roles" />
      </Field>
      <Field label="Email">
        <input name="email" type="email" className="input" defaultValue={c?.email} />
      </Field>
      <Field label="Phone">
        <input name="phone" type="tel" className="input" defaultValue={c?.phone} />
      </Field>
      <Field label="Mobile / alternative phone">
        <input name="mobile" type="tel" className="input" defaultValue={c?.mobile} />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm">
        <input type="checkbox" name="isPrimary" defaultChecked={c?.isPrimary} disabled={c?.archived} /> Primary contact
      </label>
      <Field label="Notes" className="sm:col-span-2">
        <textarea name="notes" rows={2} className="input" defaultValue={c?.notes} placeholder="Best time to call, site they look after…" />
      </Field>
    </div>
  );
}

/** The Contacts tab on the customer profile. */
export function CustomerContactsTab({ customerId, contacts, canEdit }: { customerId: string; contacts: Row[]; canEdit: boolean }) {
  const live = contacts.filter((c) => !c.archived);
  const archived = contacts.filter((c) => c.archived);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <div className="card overflow-x-auto">
          {live.length === 0 ? (
            <Empty>No contacts yet. Add the people you deal with at this customer.</Empty>
          ) : (
            <ContactList rows={live} customerId={customerId} canEdit={canEdit} />
          )}
        </div>
        {archived.length > 0 && (
          <div>
            <SectionTitle>Archived contacts</SectionTitle>
            <p className="mb-2 text-xs text-charcoal-500">Not offered on new documents. Documents made for them still show their details.</p>
            <div className="card overflow-x-auto">
              <ContactList rows={archived} customerId={customerId} canEdit={canEdit} />
            </div>
          </div>
        )}
      </div>
      {canEdit && (
        <div className="card h-fit p-6">
          <SectionTitle>Add contact</SectionTitle>
          <form action={saveContact} className="space-y-3">
            <input type="hidden" name="customerId" value={customerId} />
            <ContactFields />
            <button className="btn-primary w-full">Add contact</button>
          </form>
          <datalist id="contact-roles">
            {["Owner", "Facilities manager", "Site manager", "Accounts", "Procurement", "Reception", "Tenant"].map((r) => <option key={r} value={r} />)}
          </datalist>
        </div>
      )}
    </div>
  );
}

function ContactList({ rows, customerId, canEdit }: { rows: Row[]; customerId: string; canEdit: boolean }) {
  return (
    <ul className="divide-y divide-charcoal-100">
      {rows.map((c) => {
        const used = c._count.quotations + c._count.jobCards + c._count.invoices;
        return (
          <li key={c.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm">
                <div className="flex items-center gap-2 font-semibold">
                  {contactLabel(c)}
                  {c.isPrimary && <span className="rounded-full bg-kudu-100 px-2 py-0.5 text-xs font-semibold text-kudu-700">Primary</span>}
                </div>
                {c.role && <div className="text-charcoal-500">{c.role}</div>}
                <div className="mt-1 text-charcoal-600">
                  {[c.phone, c.mobile].filter(Boolean).join(" · ")}
                  {c.email && (
                    <>
                      {(c.phone || c.mobile) && " · "}
                      <a href={`mailto:${c.email}`} className="hover:text-kudu-600">{c.email}</a>
                    </>
                  )}
                </div>
                {c.notes && <p className="mt-1 whitespace-pre-line text-xs text-charcoal-500">{c.notes}</p>}
                {used > 0 && (
                  <div className="mt-1 text-xs text-charcoal-400">
                    On {[c._count.quotations && `${c._count.quotations} quotation${c._count.quotations === 1 ? "" : "s"}`, c._count.jobCards && `${c._count.jobCards} job card${c._count.jobCards === 1 ? "" : "s"}`, c._count.invoices && `${c._count.invoices} invoice${c._count.invoices === 1 ? "" : "s"}`].filter(Boolean).join(", ")}
                  </div>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-wrap gap-2">
                  {!c.isPrimary && !c.archived && (
                    <form action={makeContactPrimary}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="btn-outline text-xs">Make primary</button>
                    </form>
                  )}
                  <form action={setContactArchived}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="archived" value={String(!c.archived)} />
                    <button className="btn-outline text-xs">{c.archived ? "Restore" : "Archive"}</button>
                  </form>
                  {used === 0 && (
                    <form action={deleteContact}>
                      <input type="hidden" name="id" value={c.id} />
                      <ConfirmButton message={`Delete ${contactLabel(c)}?`} className="btn-outline text-xs text-kudu-700">Delete</ConfirmButton>
                    </form>
                  )}
                </div>
              )}
            </div>
            {canEdit && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-kudu-600">Edit</summary>
                <form action={saveContact} className="mt-3 space-y-3">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="customerId" value={customerId} />
                  <ContactFields c={c} />
                  <button className="btn-primary">Save contact</button>
                </form>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
