import type { Settings } from "@prisma/client";
import { toDateInput, fmtDateTime } from "@/lib/format";
import { ADAPTERS, adapter as findAdapter, shortName } from "@/lib/accounting";
import { ctxFor, loadLink } from "@/lib/accounting/store";
import type { Adapter, Option, Picker } from "@/lib/accounting/types";
import {
  checkAccountingPayments,
  chooseAccountingOrganisation,
  chooseAccountingProvider,
  disconnectAccounting,
  importPastelReceipts,
  saveAccountingLogin,
  saveAccountingOptions,
} from "@/app/actions/accounting";
import { ConfirmButton } from "./ConfirmButton";
import { Field, SectionTitle } from "./ui";

function Missing({ a }: { a: Adapter }) {
  const need = a.envVars.filter((v) => v.required);
  return (
    <div className="rounded-md bg-kudu-50 p-3 text-sm text-kudu-800">
      {a.name} is not set up on the server yet. The platform owner adds these in Vercel (see the README):
      <ul className="mt-1 list-disc pl-5">
        {need.map((v) => (
          <li key={v.name}>
            <code>{v.name}</code>: {v.help}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PickerField({ p, value }: { p: Picker; value: string }) {
  const current = value || p.suggested || "";
  return (
    <Field label={`${p.label}${p.required ? "" : " (optional)"}`}>
      {p.options ? (
        <select name={`cfg_${p.key}`} className="input" defaultValue={current}>
          <option value="">{p.required ? "Choose…" : "None"}</option>
          {p.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      ) : (
        <input name={`cfg_${p.key}`} className="input" defaultValue={current} placeholder={p.placeholder} />
      )}
      {p.help && <span className="mt-1 block text-xs text-charcoal-500">{p.help}</span>}
    </Field>
  );
}

/** Settings → Accounting: one package per company, connected and mapped here. */
export async function AccountingSettings({ s, db }: { s: Settings; db: Parameters<typeof loadLink>[0] }) {
  const a = findAdapter(s.accountingProvider);
  const link = a ? await loadLink(db, a.id) : null;
  const connected = !!link && Object.keys(link.credentials).length > 0;
  let orgs: Option[] | null = null;
  let pickers: Picker[] = [];
  let problem = "";
  if (a?.kind === "file") pickers = a.pickers();
  if (a?.kind === "api" && a.configured() && connected) {
    try {
      const ctx = await ctxFor(db, a.id);
      if (a.needsOrg) orgs = await a.organisations(ctx);
      if (!a.needsOrg || link!.orgId) pickers = await a.pickers(ctx, s.vatRate);
    } catch (e) {
      problem = (e as Error).message;
    }
  }
  const orgReady = a?.kind === "file" || (a?.kind === "api" && (!a.needsOrg || !!link?.orgId));
  const who = shortName(a?.id);

  return (
    <div id="accounting" className="card mt-6 space-y-4 p-6">
      <SectionTitle>Accounting package</SectionTitle>
      <p className="text-sm text-charcoal-500">
        Link Kudu with one accounting package. Customers, issued invoices and payments go from Kudu to the package, and payments captured there come back to Kudu
        every night (or when you press “Check for payments”). Drafts are never sent.
      </p>

      <form action={chooseAccountingProvider} className="flex flex-wrap items-end gap-3">
        <Field label="Package" className="min-w-72 flex-1">
          <select name="provider" className="input" defaultValue={s.accountingProvider}>
            <option value="">None (no link)</option>
            {ADAPTERS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
                {x.configured() ? "" : " (not set up on the server yet)"}
              </option>
            ))}
          </select>
        </Field>
        <button className="btn-outline">Use this package</button>
      </form>

      {a && <p className="text-sm text-charcoal-600">{a.blurb}</p>}
      {a && !a.configured() && <Missing a={a} />}
      {problem && <p className="rounded-md bg-kudu-50 p-2 text-sm text-kudu-800">{who} problem: {problem}</p>}

      {/* Connect */}
      {a?.kind === "api" && a.configured() && (
        <div className="space-y-3 border-t border-charcoal-100 pt-4">
          {a.auth === "oauth" ? (
            <div className="flex flex-wrap items-center gap-3">
              <a href={`/api/accounting/${a.id}/connect`} className={connected ? "btn-outline" : "btn-primary"}>
                {connected ? `Connect ${who} again` : `Connect ${who}`}
              </a>
              {connected && <span className="text-sm text-charcoal-600">Connected{link?.orgName ? ` to ${link.orgName}` : ""}.</span>}
            </div>
          ) : (
            <form action={saveAccountingLogin} className="grid gap-3 sm:grid-cols-2 sm:items-end">
              {a.loginFields!.map((f) => (
                <Field key={f.name} label={f.secret && connected ? `${f.label} (leave blank to keep)` : f.label}>
                  <input
                    name={f.name}
                    type={f.type ?? "text"}
                    className="input"
                    placeholder={f.placeholder}
                    autoComplete={f.secret ? "new-password" : "off"}
                    defaultValue={f.secret ? "" : (link?.credentials[f.name] ?? (f.name === "username" ? link?.config.username : "") ?? "")}
                  />
                  {f.help && <span className="mt-1 block text-xs text-charcoal-500">{f.help}</span>}
                </Field>
              ))}
              <div>
                <button className={connected ? "btn-outline" : "btn-primary"}>{connected ? "Update login" : `Connect ${who}`}</button>
              </div>
            </form>
          )}

          {connected && a.needsOrg && orgs && (
            <form action={chooseAccountingOrganisation} className="flex flex-wrap items-end gap-3">
              <Field label="Organisation / company" className="min-w-72 flex-1">
                <select name="org" className="input" defaultValue={link?.orgId ? `${link.orgId}|${link.orgName}` : ""}>
                  <option value="">Choose…</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={`${o.id}|${o.name}`}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn-outline">Use this organisation</button>
            </form>
          )}
        </div>
      )}

      {/* Choices */}
      {a && (a.kind === "file" || (connected && orgReady && !problem)) && (
        <form action={saveAccountingOptions} className="space-y-3 border-t border-charcoal-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {pickers.map((p) => (
              <PickerField key={p.key} p={p} value={link?.config[p.key] ?? ""} />
            ))}
            <Field label={a.kind === "file" ? "Export invoices issued from" : "Send invoices issued from"}>
              <input type="date" name="acctStartDate" className="input" defaultValue={toDateInput(s.acctStartDate)} />
              <span className="mt-1 block text-xs text-charcoal-500">Older invoices are assumed to be in {who} already.</span>
            </Field>
          </div>
          {a.kind === "api" && (
            <div className="space-y-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="checkbox" name="acctAutoSend" defaultChecked={s.acctAutoSend} className="accent-kudu-600" /> Send automatically when an invoice is issued or a
                payment is recorded
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="acctUseKuduNumbers" defaultChecked={s.acctUseKuduNumbers} className="accent-kudu-600" /> Use Kudu&apos;s invoice numbers in {who}
              </label>
              {a.notes && <p className="text-xs text-charcoal-500">{a.notes}</p>}
            </div>
          )}
          {a.kind === "file" && (
            <>
              <input type="hidden" name="acctAutoSend" value="" />
              <input type="hidden" name="acctUseKuduNumbers" value="on" />
            </>
          )}
          <button className="btn-primary">Save {who} settings</button>
        </form>
      )}

      {/* Pastel files */}
      {a?.kind === "file" && (
        <div className="space-y-4 border-t border-charcoal-100 pt-4 text-sm">
          <p className="text-charcoal-600">
            Download in this order and import each one in Pastel (Partner: <i>Setup → Import/Export</i> for customers, <i>Process → Journals / Receipts → Batch → Import</i> for
            invoices and receipts. Evolution: <i>Common → Import/Export</i>, map the columns once and save the layout). Each file holds only what is new since the last download.
            Try the first import on a test copy of your Pastel company.
          </p>
          {(["customers", "invoices", "receipts"] as const).map((kind, i) => (
            <form key={kind} action="/api/accounting/pastel/export" method="post" className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="kind" value={kind} />
              <span className="w-56 font-medium">
                {i + 1}. {kind === "customers" ? "Customers on new invoices" : kind === "invoices" ? "New invoices (sales batch)" : "Payments recorded in Kudu (receipts batch)"}
              </span>
              <select name="format" className="input w-auto" defaultValue="partner" aria-label="Format">
                <option value="partner">Pastel Partner</option>
                <option value="evolution">Sage Evolution</option>
              </select>
              <label className="flex items-center gap-1">
                <input type="checkbox" name="all" className="accent-kudu-600" /> everything again
              </label>
              {kind === "receipts" && (
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="positive" className="accent-kudu-600" /> positive amounts
                </label>
              )}
              <button className="btn-outline py-1">Download CSV</button>
            </form>
          ))}
          <form action={importPastelReceipts} className="flex flex-wrap items-center gap-3 border-t border-charcoal-100 pt-4">
            <span className="w-56 font-medium">Payments captured in Pastel</span>
            <input type="file" name="file" accept=".csv,.txt,text/csv" className="text-sm" />
            <button className="btn-dark py-1">Import receipts</button>
            <span className="block w-full text-xs text-charcoal-500">
              A CSV from Pastel with columns for the date, the invoice number (or reference) and the amount. Each receipt is added once to the Kudu invoice with that number.
            </span>
          </form>
        </div>
      )}

      {s.acctLastError && <p className="rounded-md bg-kudu-50 p-2 text-sm text-kudu-800">Last check: {s.acctLastError}</p>}
      {a?.kind === "api" && connected && (
        <div className="flex flex-wrap items-center gap-2 border-t border-charcoal-100 pt-4">
          {orgReady && (
            <form action={checkAccountingPayments}>
              <button className="btn-dark">Check {who} for payments now</button>
            </form>
          )}
          <form action={disconnectAccounting}>
            <ConfirmButton message={`Disconnect ${who}? Nothing is removed from ${who}.`} className="btn-danger">
              Disconnect {who}
            </ConfirmButton>
          </form>
          {s.acctLastSyncAt && <span className="text-xs text-charcoal-500">Last checked {fmtDateTime(s.acctLastSyncAt)}</span>}
        </div>
      )}
    </div>
  );
}
