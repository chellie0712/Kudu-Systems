import { authDisabled, requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { googleConfigured } from "@/lib/google";
import { deleteProduct, disconnectGoogleCalendar, saveProduct, saveSettings, useMyGoogleCalendar } from "@/app/actions/settings";
import { SignaturePad } from "@/components/JobCardEditors";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser();
  const { msg, err } = await searchParams;
  const s = await getSettings();
  const products = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const syncUser = s.googleSyncUserId ? await db.user.findUnique({ where: { id: s.googleSyncUserId } }) : null;

  const text = (name: keyof typeof s, label: string, className = "") => (
    <Field label={label} className={className}>
      <input name={name} className="input" defaultValue={String(s[name] ?? "")} />
    </Field>
  );

  return (
    <div className="max-w-4xl">
      <PageHeader title="Settings" subtitle="Company details print on every quotation, job card and invoice." />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <form action={saveSettings} className="card space-y-8 p-6">
        <section>
          <SectionTitle>Company</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {text("companyName", "Company name")}
            {text("tagline", "Tagline")}
            {text("email", "Email")}
            {text("phone", "Phone")}
            {text("website", "Website")}
            {text("vatNumber", "VAT number")}
            {text("regNumber", "Registration number")}
            <Field label="Address" className="md:col-span-2">
              <textarea name="address" rows={3} className="input" defaultValue={s.address} />
            </Field>
          </div>
        </section>
        <section>
          <SectionTitle>Money</SectionTitle>
          <div className="grid gap-4 md:grid-cols-4">
            {text("currency", "Currency code")}
            {text("currencySymbol", "Currency symbol")}
            <Field label="VAT rate %"><input name="vatRate" inputMode="decimal" className="input" defaultValue={s.vatRate} /></Field>
            <div />
            {text("bankName", "Bank")}
            {text("bankAccountName", "Account name")}
            {text("bankAccountNumber", "Account number")}
            {text("bankBranchCode", "Branch code")}
          </div>
        </section>
        <section>
          <SectionTitle>Documents</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            {text("quotePrefix", "Quotation prefix")}
            {text("jobCardPrefix", "Job card prefix")}
            {text("invoicePrefix", "Invoice prefix")}
            <Field label="Quote valid for (days)"><input name="quoteValidityDays" type="number" className="input" defaultValue={s.quoteValidityDays} /></Field>
            <Field label="Invoice due after (days)"><input name="invoiceDueDays" type="number" className="input" defaultValue={s.invoiceDueDays} /></Field>
            <div />
            <Field label="Default quotation terms" className="md:col-span-3">
              <textarea name="quoteTerms" rows={3} className="input" defaultValue={s.quoteTerms} />
            </Field>
            <Field label="Default invoice terms" className="md:col-span-3">
              <textarea name="invoiceTerms" rows={3} className="input" defaultValue={s.invoiceTerms} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-charcoal-500">
            Next numbers: {s.quotePrefix}{String(s.nextQuoteNo).padStart(4, "0")}, {s.jobCardPrefix}{String(s.nextJobCardNo).padStart(4, "0")}, {s.invoicePrefix}{String(s.nextInvoiceNo).padStart(4, "0")}
          </p>
        </section>
        <section id="jobcard">
          <SectionTitle>Job card &amp; service warranty</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {text("jobCardTitle", "Job card title")}
            {text("jobCardSubtitle", "Subtitle (e.g. Registered Pest Control Operator)")}
            {text("pcoNumber", "PCO number")}
            <Field label="Default warranty length (months)">
              <input name="warrantyMonths" type="number" min={0} className="input" defaultValue={s.warrantyMonths} />
            </Field>
            <Field label="Warranty covers options (one per line)">
              <textarea name="warrantyCovers" rows={6} className="input" defaultValue={s.warrantyCovers} />
            </Field>
            <Field label="Warranty terms & conditions (one per line)">
              <textarea name="warrantyTerms" rows={6} className="input" defaultValue={s.warrantyTerms} />
            </Field>
            <div className="md:col-span-2 md:max-w-md">
              <SignaturePad name="pcoSignature" label="PCO signature (printed on every job card)" initial={s.pcoSignature} placeholder="Sign here or upload an image" allowUpload />
            </div>
          </div>
        </section>
        <section id="google">
          <SectionTitle>Google Calendar</SectionTitle>
          <Field label="Calendar ID">
            <input name="googleCalendarId" className="input max-w-md" defaultValue={s.googleCalendarId} />
          </Field>
          <p className="mt-1 text-xs text-charcoal-500">
            Use <code>primary</code> for the connected account&apos;s main calendar, or the ID of a shared company calendar (Google Calendar → Settings → Integrate calendar).
          </p>
        </section>
        <button className="btn-primary">Save settings</button>
      </form>

      <div id="products" className="card mt-6 p-6">
        <SectionTitle>Products (active ingredients list on job cards)</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">Untick “Show” to hide a product from new job cards. Past job cards keep what was recorded.</p>
        <div className="space-y-2">
          {products.map((p) => (
            <div key={p.id} className="flex flex-wrap items-end gap-2 border-b border-charcoal-100 pb-2">
              <form action={saveProduct} className="flex flex-1 flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="sortOrder" value={p.sortOrder} />
                <input name="name" className="input w-44 flex-none" defaultValue={p.name} aria-label="Product name" />
                <input name="activeIngredient" className="input min-w-48 flex-1" defaultValue={p.activeIngredient} placeholder="Active ingredient" aria-label="Active ingredient" />
                <input name="regNumber" className="input w-36 flex-none" defaultValue={p.regNumber} placeholder="Reg. no." aria-label="Registration number" />
                <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-kudu-600" /> Show</label>
                <button className="btn-outline py-1.5">Save</button>
              </form>
              <form action={deleteProduct}>
                <input type="hidden" name="id" value={p.id} />
                <ConfirmButton message={`Delete ${p.name}?`} className="btn-danger py-1.5">Delete</ConfirmButton>
              </form>
            </div>
          ))}
        </div>
        <form action={saveProduct} className="mt-4 flex flex-wrap items-end gap-2">
          <input name="name" className="input w-44 flex-none" placeholder="New product name" required />
          <input name="activeIngredient" className="input min-w-48 flex-1" placeholder="Active ingredient" />
          <input name="regNumber" className="input w-36 flex-none" placeholder="Reg. no." />
          <button className="btn-primary py-1.5">+ Add product</button>
        </form>
      </div>

      <div className="card mt-6 space-y-3 p-6">
        <SectionTitle>Calendar connection</SectionTitle>
        {!googleConfigured ? (
          <p className="text-sm text-kudu-700">
            Google is not configured on the server. Set <code>AUTH_GOOGLE_ID</code> and <code>AUTH_GOOGLE_SECRET</code> (see the README), then sign in with Google.
          </p>
        ) : syncUser ? (
          <>
            <p className="text-sm">
              Syncing as <strong>{syncUser.email}</strong>. Job cards and appointments are sent to Google when saved; use “Sync with Google” on the calendar to pull changes made in Google.
            </p>
            <div className="flex gap-2">
              {syncUser.id !== user.id && (
                <form action={useMyGoogleCalendar}><button className="btn-outline">Use my Google account instead</button></form>
              )}
              <form action={disconnectGoogleCalendar}><button className="btn-danger">Disconnect</button></form>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm">No account connected. Connect the Google account whose calendar Kudu should keep in sync.</p>
            <form action={useMyGoogleCalendar}>
              <button className="btn-primary" disabled={authDisabled}>Use my Google account ({user.email})</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
