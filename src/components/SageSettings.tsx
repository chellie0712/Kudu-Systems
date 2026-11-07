import type { Settings } from "@prisma/client";
import { decryptSecret } from "@/lib/secret";
import { toDateInput } from "@/lib/format";
import { type Option, sageBankAccounts, sageCompanies, sageConfigured, sageItems, sageTaxTypes } from "@/lib/sage";
import { checkSagePayments, disconnectSage, saveSageLogin, saveSageOptions } from "@/app/actions/sage";
import { ConfirmButton } from "./ConfirmButton";
import { Field, SectionTitle } from "./ui";

/** Settings → Sage. Lists are read live from Sage so the choices match the company's books. */
export async function SageSettings({ s }: { s: Settings }) {
  const connected = sageConfigured() && !!s.sageUsername && !!s.sagePassword;
  let companies: Option[] = [];
  let taxTypes: (Option & { percentage: number; isDefault: boolean })[] = [];
  let items: Option[] = [];
  let banks: Option[] = [];
  let problem = "";
  if (connected) {
    const login = { username: s.sageUsername, password: decryptSecret(s.sagePassword!), companyId: s.sageCompanyId };
    try {
      companies = await sageCompanies(login);
      if (s.sageCompanyId) [taxTypes, items, banks] = await Promise.all([sageTaxTypes(login), sageItems(login), sageBankAccounts(login)]);
    } catch (e) {
      problem = (e as Error).message;
    }
  }
  const standard = s.sageTaxTypeId ?? taxTypes.find((t) => t.percentage === s.vatRate && t.isDefault)?.id ?? taxTypes.find((t) => t.percentage === s.vatRate)?.id;
  const zero = s.sageZeroTaxTypeId ?? taxTypes.find((t) => t.percentage === 0)?.id;

  return (
    <div id="sage" className="card mt-6 space-y-4 p-6">
      <SectionTitle>Sage Accounting</SectionTitle>
      <p className="text-sm text-charcoal-500">
        Links Kudu with Sage Business Cloud Accounting (South Africa) both ways: customers, issued invoices and payments go from Kudu to Sage, and payments captured in Sage come back to Kudu.
        Drafts are never sent: Sage has no draft invoices, so an invoice goes to Sage when it is marked as sent.
      </p>
      {!sageConfigured() ? (
        <p className="text-sm text-kudu-700">
          Sage is not set up on the server yet. The platform owner adds the Sage API key as <code>SAGE_API_KEY</code> (see the README).
        </p>
      ) : (
        <>
          {problem && <p className="rounded-md bg-kudu-50 p-2 text-sm text-kudu-800">Sage problem: {problem}</p>}
          <form action={saveSageLogin} className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Sage username (email)">
              <input name="sageUsername" type="email" className="input" defaultValue={s.sageUsername} autoComplete="off" />
            </Field>
            <Field label={s.sagePassword ? "Sage password (leave blank to keep)" : "Sage password"}>
              <input name="sagePassword" type="password" className="input" autoComplete="new-password" />
            </Field>
            <button className={connected ? "btn-outline" : "btn-primary"}>{connected ? "Update login" : "Connect Sage"}</button>
            <p className="text-xs text-charcoal-500 sm:col-span-3">
              Tip: add a separate user in Sage for Kudu (for example kudu@yourcompany.co.za), so changing someone&apos;s own password doesn&apos;t stop the link.
            </p>
          </form>

          {connected && !problem && (
            <form action={saveSageOptions} className="space-y-3 border-t border-charcoal-100 pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sage company">
                  <select name="company" className="input" defaultValue={s.sageCompanyId ? `${s.sageCompanyId}|${s.sageCompanyName}` : ""}>
                    <option value="">Choose…</option>
                    {companies.map((c) => <option key={c.id} value={`${c.id}|${c.name}`}>{c.name}</option>)}
                  </select>
                </Field>
                {s.sageCompanyId && (
                  <>
                    <Field label={`VAT type for ${s.vatRate}% lines`}>
                      <select name="taxType" className="input" defaultValue={standard ?? ""}>
                        <option value="">Choose…</option>
                        {taxTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>)}
                      </select>
                    </Field>
                    <Field label="VAT type for 0% invoices">
                      <select name="zeroTaxType" className="input" defaultValue={zero ?? ""}>
                        <option value="">Same as above</option>
                        {taxTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.percentage}%)</option>)}
                      </select>
                    </Field>
                    <Field label="Post invoice lines as this Sage item / service">
                      <select name="item" className="input" defaultValue={s.sageItemId ? `${s.sageItemId}|${s.sageItemName}` : ""}>
                        <option value="">Choose…</option>
                        {items.map((i) => <option key={i.id} value={`${i.id}|${i.name}`}>{i.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Bank account for payments">
                      <select name="bankAccount" className="input" defaultValue={s.sageBankAccountId ?? ""}>
                        <option value="">Choose…</option>
                        {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </Field>
                    <Field label="Send invoices issued from">
                      <input type="date" name="sageStartDate" className="input" defaultValue={toDateInput(s.sageStartDate)} />
                    </Field>
                  </>
                )}
              </div>
              {s.sageCompanyId && (
                <div className="space-y-1 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="sageAutoSend" defaultChecked={s.sageAutoSend} className="accent-kudu-600" /> Send automatically when an invoice is issued or a payment is recorded
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" name="sageUseKuduNumbers" defaultChecked={s.sageUseKuduNumbers} className="accent-kudu-600" /> Use Kudu&apos;s invoice numbers in Sage (untick to let Sage number them)
                  </label>
                  <p className="text-xs text-charcoal-500">
                    Each line keeps its own description and price; the item only decides which sales account Sage posts it to. Invoices issued before the date above are
                    assumed to be in Sage already and are only sent if you press &quot;Send to Sage&quot; on them.
                  </p>
                </div>
              )}
              <button className="btn-primary">Save Sage settings</button>
            </form>
          )}
          {s.sageLastError && <p className="rounded-md bg-kudu-50 p-2 text-sm text-kudu-800">Last nightly check: {s.sageLastError}</p>}
          {s.sagePassword && (
            <div className="flex flex-wrap gap-2 border-t border-charcoal-100 pt-4">
              {s.sageCompanyId && (
                <form action={checkSagePayments}>
                  <button className="btn-dark">Check Sage for payments now</button>
                </form>
              )}
              <form action={disconnectSage}>
                <ConfirmButton message="Disconnect Sage? Nothing is removed from Sage." className="btn-danger">Disconnect Sage</ConfirmButton>
              </form>
            </div>
          )}
          <p className="text-xs text-charcoal-500">
            Payments captured in Sage (for example from the bank feed) are checked every night and added to the matching Kudu invoice as a payment &quot;from Sage&quot;.
            Payments recorded in Kudu go to Sage as receipts, allocated to their invoice.
          </p>
        </>
      )}
    </div>
  );
}
