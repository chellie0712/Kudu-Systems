"use client";

import { useState } from "react";
import type { CustomerWithContacts } from "@/lib/contacts";
import { Field } from "./ui";

const label = (c: CustomerWithContacts["contacts"][number]) =>
  [c.name || c.email || c.phone || c.mobile || "Unnamed contact", c.role].filter(Boolean).join(" – ") + (c.isPrimary ? " (primary)" : "");

const primaryOf = (cu?: CustomerWithContacts) => cu?.contacts.find((c) => c.isPrimary)?.id ?? cu?.contacts[0]?.id ?? "";

/**
 * Customer and contact selects for quotations, job cards and invoices. Choosing a customer
 * picks its primary contact; the contact can then be changed to anyone at that customer.
 * With `jobCard`, it also shows the job card's site contact and number, filled from the contact.
 */
export function CustomerContactPicker({
  customers,
  customerId: initialCustomer = "",
  contactId: initialContact,
  disabled = false,
  customerLabel = "Customer *",
  customerClassName = "",
  contactClassName = "",
  jobCard,
}: {
  customers: CustomerWithContacts[];
  customerId?: string;
  /** The document's contact; when not given, the customer's primary contact. */
  contactId?: string | null;
  disabled?: boolean;
  customerLabel?: string;
  customerClassName?: string;
  contactClassName?: string;
  jobCard?: { siteContact: string; contactNumber: string };
}) {
  const [customerId, setCustomerId] = useState(initialCustomer);
  const customer = customers.find((c) => c.id === customerId);
  const [contactId, setContactId] = useState(initialContact ?? primaryOf(customer));
  const [siteContact, setSiteContact] = useState(jobCard?.siteContact ?? "");
  const [contactNumber, setContactNumber] = useState(jobCard?.contactNumber ?? "");

  function fillFrom(cu: CustomerWithContacts | undefined, id: string) {
    if (!jobCard) return;
    const c = cu?.contacts.find((x) => x.id === id);
    setSiteContact(c ? c.name || (cu?.type === "INDIVIDUAL" ? cu.name : "") : cu?.type === "INDIVIDUAL" ? cu.name : "");
    setContactNumber(c ? c.phone || c.mobile : "");
  }

  const contacts = customer?.contacts ?? [];
  return (
    <>
      <Field label={customerLabel} className={customerClassName}>
        <select
          name="customerId"
          required
          className="input"
          value={customerId}
          disabled={disabled}
          onChange={(e) => {
            const cu = customers.find((c) => c.id === e.target.value);
            const next = primaryOf(cu);
            setCustomerId(e.target.value);
            setContactId(next);
            fillFrom(cu, next);
          }}
        >
          <option value="" disabled>Choose a customer…</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Contact" className={contactClassName}>
        <select
          name="contactId"
          className="input"
          value={contactId}
          disabled={disabled || !contacts.length}
          onChange={(e) => {
            setContactId(e.target.value);
            fillFrom(customer, e.target.value);
          }}
        >
          {!contacts.length && <option value="">{customer ? "No contacts on file" : "Choose a customer first"}</option>}
          {contacts.map((c) => <option key={c.id} value={c.id}>{label(c)}</option>)}
        </select>
      </Field>
      {jobCard && (
        <>
          <Field label="Contact number">
            <input name="contactNumber" type="tel" className="input" value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="e.g. 082 123 4567" disabled={disabled} />
          </Field>
          <Field label="Site contact person">
            <input name="siteContact" className="input" value={siteContact} onChange={(e) => setSiteContact(e.target.value)} disabled={disabled} />
          </Field>
        </>
      )}
    </>
  );
}
