import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, money, toDateInput } from "@/lib/format";
import { approveInvoice, deleteInvoice, deletePayment, recordPayment, rejectInvoice, requestInvoiceApproval, setInvoiceStatus } from "@/app/actions/invoices";
import { approvalState, maySend } from "@/lib/approval";
import { Field, Flash, PageHeader, SectionTitle, StatusBadge } from "@/components/ui";
import { InvoiceSheet } from "@/components/DocSheets";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";
import { invoiceDisplayStatus } from "@/components/DocTables";
import { shortName } from "@/lib/accounting";
import { linkKey } from "@/lib/accounting/store";
import { linkReady } from "@/lib/accounting/sync";
import { checkAccountingPayments, sendInvoiceToAccountingNow } from "@/app/actions/accounting";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const user = await requirePermission("invoices.view");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [inv, settings] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        customer: { include: { branch: true } },
        contact: true,
        items: { orderBy: { sortOrder: "asc" } },
        payments: { orderBy: { date: "asc" } },
        quotation: { select: { id: true, number: true } },
        jobCard: { select: { id: true, number: true } },
      },
    }),
    getSettings(),
  ]);
  if (!inv) notFound();
  const sym = settings.currencySymbol;
  const balance = inv.total - inv.amountPaid;
  const status = invoiceDisplayStatus(inv);
  const approval = approvalState(inv, settings);
  const canApprove = can(user, "invoices.approve");
  // Accounting package (Settings → Accounting). Pastel is by file, so it has no buttons here.
  const acctProvider = settings.accountingProvider;
  const acctRow = acctProvider ? await db.accountingLink.findUnique({ where: { provider: acctProvider } }) : null;
  const acct = linkReady(settings, acctRow);
  const acctKey = acctRow ? linkKey({ provider: acctProvider, orgId: acctRow.orgId }) : "";
  const acctWho = shortName(inv.acctLink || acctProvider);
  const inBooks = !!inv.acctId && (!acctKey || inv.acctLink === acctKey);
  const isPastel = (inv.acctLink || acctProvider).startsWith("pastel");
  const unsentPayments = inv.payments.filter((p) => !p.fromAccounting && !(p.acctId && p.acctLink === inv.acctLink)).length;
  const beforeStart = !inBooks && !!settings.acctStartDate && inv.issueDate < settings.acctStartDate;

  return (
    <div>
      <PageHeader
        back={{ href: `/customers/${inv.customerId}?tab=invoices`, label: inv.customer.name }}
        title={<span className="flex items-center gap-3">{inv.number} <StatusBadge status={status} /></span>}
        subtitle={`Balance due ${money(balance, sym)} · due ${fmtDate(inv.dueDate)}`}
        actions={
          <>
            <Link href={`/invoices/${inv.id}/edit`} className="btn-primary">Edit</Link>
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        {inv.status === "DRAFT" && maySend(approval) && (
          <form action={setInvoiceStatus}>
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="status" value="SENT" />
            <button className="btn-outline py-1 text-xs">Mark as sent</button>
          </form>
        )}
        {inv.status !== "CANCELLED" && (
          <form action={setInvoiceStatus}>
            <input type="hidden" name="id" value={inv.id} />
            <input type="hidden" name="status" value="CANCELLED" />
            <ConfirmButton message="Cancel this invoice?" className="btn-outline py-1 text-xs">Cancel invoice</ConfirmButton>
          </form>
        )}
        <span className="ml-auto flex gap-3">
          {inv.quotation && <Link href={`/quotations/${inv.quotation.id}`} className="text-kudu-600 hover:underline">Quotation {inv.quotation.number}</Link>}
          {inv.jobCard && <Link href={`/job-cards/${inv.jobCard.id}`} className="text-kudu-600 hover:underline">Job card {inv.jobCard.number}</Link>}
        </span>
      </div>

      {(acct || isPastel || inv.acctId || inv.acctError) && acctProvider !== "" && inv.status !== "DRAFT" && (
        <div className={`no-print mb-4 flex flex-wrap items-center gap-3 rounded-md border p-3 text-sm ${inv.acctError ? "border-amber-200 bg-amber-50" : "border-charcoal-200 bg-white"}`}>
          <span>
            <b>{acctWho}:</b>{" "}
            {inBooks
              ? <>{isPastel ? "exported" : "sent"} as {inv.acctNumber || inv.number}{inv.acctSentAt && ` on ${fmtDateTime(inv.acctSentAt)}`}{!isPastel && unsentPayments > 0 && `, ${unsentPayments} payment${unsentPayments === 1 ? "" : "s"} not yet sent`}.</>
              : beforeStart ? `not sent (issued before the start date in Settings → Accounting, so assumed to be in ${acctWho} already).` : isPastel ? "not exported yet (Settings → Accounting)." : "not sent yet."}
            {inv.acctError && <span className="block text-kudu-700">{inv.acctError}</span>}
          </span>
          {acct && !isPastel && (
            <span className="ml-auto flex gap-2">
              {inBooks && (inv.status === "SENT" || inv.status === "PARTIALLY_PAID") && (
                <form action={checkAccountingPayments}>
                  <input type="hidden" name="id" value={inv.id} />
                  <button className="btn-outline py-1 text-xs">Check {acctWho} for payments</button>
                </form>
              )}
              {inv.status !== "CANCELLED" && can(user, "invoices.edit") && (
                <form action={sendInvoiceToAccountingNow}>
                  <input type="hidden" name="id" value={inv.id} />
                  <button className="btn-outline py-1 text-xs">{inBooks ? `Send again to ${acctWho}` : `Send to ${acctWho}`}</button>
                </form>
              )}
            </span>
          )}
        </div>
      )}

      {approval !== "NOT_NEEDED" && inv.status !== "CANCELLED" && (
        <div
          className={`no-print mb-4 rounded-md border p-4 text-sm ${
            approval === "APPROVED" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
          }`}
        >
          {approval === "APPROVED" && (
            <p>
              <b>Approved</b> by {inv.approvedBy || "an admin"} on {fmtDateTime(inv.approvedAt)}.
              {inv.status === "DRAFT" && " It can now be sent."}
            </p>
          )}
          {approval === "NEEDED" && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="flex-1">
                <b>Needs approval before it can be sent.</b>
                {inv.approvalNote && <span className="block text-kudu-700">Sent back: {inv.approvalNote}</span>}
              </p>
              <form action={requestInvoiceApproval}>
                <input type="hidden" name="id" value={inv.id} />
                <button className="btn-dark py-1.5">Submit for approval</button>
              </form>
              {canApprove && (
                <form action={approveInvoice}>
                  <input type="hidden" name="id" value={inv.id} />
                  <button className="btn-primary py-1.5">Approve</button>
                </form>
              )}
            </div>
          )}
          {approval === "REQUESTED" && (
            <div className="space-y-3">
              <p>
                <b>Waiting for approval</b> · submitted by {inv.approvalRequestedBy || "office"} on {fmtDateTime(inv.approvalRequestedAt)}.
                {!canApprove && " An admin needs to approve it."}
              </p>
              {canApprove && (
                <div className="flex flex-wrap items-end gap-2">
                  <form action={approveInvoice}>
                    <input type="hidden" name="id" value={inv.id} />
                    <button className="btn-primary py-1.5">Approve</button>
                  </form>
                  <form action={rejectInvoice} className="flex flex-1 flex-wrap gap-2">
                    <input type="hidden" name="id" value={inv.id} />
                    <input name="note" className="input min-w-48 flex-1 py-1.5" placeholder="Reason for sending back" aria-label="Reason for sending back" />
                    <button className="btn-outline py-1.5">Send back</button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <InvoiceSheet inv={inv} settings={settings} />

        <aside className="no-print space-y-6">
          <div className="card p-5">
            <SectionTitle>Payments</SectionTitle>
            {inv.payments.length === 0 ? (
              <p className="text-sm text-charcoal-500">No payments yet.</p>
            ) : (
              <ul className="divide-y divide-charcoal-100 text-sm">
                {inv.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-medium">{money(p.amount, sym)}</div>
                      <div className="text-xs text-charcoal-500">{fmtDate(p.date)} · {p.method}{p.reference && ` · ${p.reference}`}{p.acctId && !p.fromAccounting && ` · in ${shortName(p.acctLink)}`}{p.fromAccounting && ` · from ${shortName(p.acctLink)}`}</div>
                      {p.acctError && <div className="text-xs text-kudu-700">{shortName(p.acctLink || acctProvider)}: {p.acctError}</div>}
                    </div>
                    {can(user, "payments.delete") && (
                      <form action={deletePayment}>
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton message="Remove this payment?" className="text-xs text-charcoal-400 hover:text-kudu-600">Remove</ConfirmButton>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {inv.status !== "CANCELLED" && balance > 0 && (
              <form action={recordPayment} className="mt-4 space-y-3 border-t border-charcoal-100 pt-4">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <Field label="Amount"><input name="amount" inputMode="decimal" className="input" defaultValue={(balance / 100).toFixed(2)} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><input name="date" type="date" className="input" defaultValue={toDateInput(new Date())} /></Field>
                  <Field label="Method">
                    <select name="method" className="input">
                      {["EFT", "Cash", "Card", "Cheque", "Other"].map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Reference"><input name="reference" className="input" /></Field>
                <button className="btn-primary w-full">Record payment</button>
              </form>
            )}
          </div>
          {can(user, "invoices.delete") && (
            <form action={deleteInvoice} className="text-right">
              <input type="hidden" name="id" value={inv.id} />
              <ConfirmButton message={`Delete invoice ${inv.number} and its payments? Consider cancelling instead to keep your numbering intact.`}>
                Delete invoice
              </ConfirmButton>
            </form>
          )}
        </aside>
      </div>
    </div>
  );
}
