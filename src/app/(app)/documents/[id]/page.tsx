import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { maySeeDoc } from "@/lib/documents/access";
import { deleteDocument, signDocument } from "@/app/actions/documents";
import { Flash, PageHeader } from "@/components/ui";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";
import { GeneratedDocSheet } from "@/components/GeneratedDocSheet";
import { SignaturePad } from "@/components/JobCardEditors";

export const metadata = { title: "Document" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("documents.create");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [doc, settings] = await Promise.all([
    db.generatedDoc.findUnique({
      where: { id },
      include: { customer: { select: { name: true } }, jobCard: { select: { number: true } }, quotation: { select: { number: true } }, invoice: { select: { number: true } } },
    }),
    getSettings(),
  ]);
  if (!doc) notFound();
  if (!(await maySeeDoc(db, user, doc))) redirect("/no-access?need=documents.view");
  const from = doc.jobCardId
    ? { href: `/job-cards/${doc.jobCardId}`, label: doc.jobCard!.number }
    : doc.quotationId
      ? { href: `/quotations/${doc.quotationId}`, label: doc.quotation!.number }
      : doc.invoiceId
        ? { href: `/invoices/${doc.invoiceId}`, label: doc.invoice!.number }
        : { href: `/customers/${doc.customerId}?tab=documents`, label: doc.customer.name };
  const needsSignature = doc.body.includes("[[signatures]]") && !doc.clientSignedAt;

  return (
    <div>
      <div className="no-print mx-auto max-w-3xl">
        <PageHeader
          back={from}
          title={`${doc.name} ${doc.number}`}
          subtitle={`Made by ${doc.createdBy} for ${doc.customer.name}${doc.showInPortal ? " · shown in the customer portal" : ""}`}
          actions={<PrintButton />}
        />
        <Flash message={msg} />
        <Flash message={err} tone="error" />
      </div>
      <GeneratedDocSheet doc={doc} settings={settings} />
      <div className="no-print mx-auto mt-6 max-w-3xl space-y-4">
        {needsSignature && (
          <form action={signDocument} className="card space-y-3 p-5">
            <input type="hidden" name="id" value={doc.id} />
            <h2 className="text-sm font-bold tracking-wide text-charcoal-700 uppercase">Client signs on this device</h2>
            <label className="block">
              <span className="label">Name of the person signing</span>
              <input name="signedName" className="input" required />
            </label>
            <SignaturePad name="signature" label="Signature" />
            <button className="btn-primary">Save signature</button>
          </form>
        )}
        <p className="text-xs text-charcoal-500">
          The text was filled in when the document was made, so later changes to {from.label} don&apos;t change it. To update it, make a new one.
        </p>
        {can(user, "documents.delete") && (
          <form action={deleteDocument} className="text-right">
            <input type="hidden" name="id" value={doc.id} />
            <ConfirmButton message={`Delete ${doc.number}? It also disappears from the customer portal.`} className="text-sm text-kudu-600 hover:underline">Delete document</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
