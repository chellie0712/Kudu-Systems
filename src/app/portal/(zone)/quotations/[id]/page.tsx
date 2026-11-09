import { notFound } from "next/navigation";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDateTime } from "@/lib/format";
import { portalQuotes } from "@/lib/portalData";
import { respondToQuotation } from "@/app/actions/portal";
import { QuotationSheet } from "@/components/DocSheets";
import { PortalBack, PortalNotice, QuoteBadge } from "@/components/Portal";
import { PrintButton } from "@/components/ConfirmButton";

export const metadata = { title: "Quotation" };

export default async function PortalQuotation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [q, settings] = await Promise.all([
    db.quotation.findFirst({
      where: { id, ...portalQuotes(user.customerId) },
      include: { customer: { include: { branch: true } }, contact: true, items: { orderBy: { sortOrder: "asc" } } },
    }),
    getSettings(),
  ]);
  if (!q) notFound();
  const expired = q.validUntil < new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <div>
      <PortalBack href="/portal/quotations" label="Quotations" />
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-bold">Quotation {q.number} <QuoteBadge status={q.status} /></h1>
        <PrintButton />
      </div>
      <PortalNotice msg={msg} err={err} />

      {q.status === "SENT" && !expired && (
        <form className="no-print card mb-6 space-y-3 border-l-4 border-l-kudu-600 p-5">
          <input type="hidden" name="id" value={q.id} />
          <p className="font-semibold">Would you like to go ahead with this quotation?</p>
          <label className="block">
            <span className="label">Message for us (optional)</span>
            <textarea name="note" rows={2} maxLength={2000} className="input" placeholder="e.g. Please book for a Monday morning" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button formAction={respondToQuotation.bind(null, "ACCEPTED")} className="btn-primary px-6 py-2.5">Accept quotation</button>
            <button formAction={respondToQuotation.bind(null, "DECLINED")} className="btn-outline px-6 py-2.5">Decline</button>
          </div>
          <p className="text-xs text-charcoal-500">Accepting confirms you agree to the price and terms below. We&apos;ll contact you to book the work.</p>
        </form>
      )}
      {q.status === "SENT" && expired && (
        <div className="no-print mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">This quotation has expired. Please log a query if you&apos;d like an updated quote.</div>
      )}
      {q.respondedAt && (
        <div className="no-print mb-6 rounded-md border border-charcoal-200 bg-white p-3 text-sm">
          {q.response === "DECLINED" ? "Declined" : "Accepted"} by {q.respondedBy} on {fmtDateTime(q.respondedAt)}.
          {q.responseNote && <span className="mt-1 block italic">“{q.responseNote}”</span>}
        </div>
      )}

      <QuotationSheet q={q} settings={settings} />
    </div>
  );
}
