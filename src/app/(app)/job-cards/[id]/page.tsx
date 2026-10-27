import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { lines } from "@/lib/jobcard";
import { createInvoiceFromJobCard, deleteJobCard, setJobCardStatus } from "@/app/actions/jobCards";
import { Flash, NumberedSection, PageHeader, StatusBadge } from "@/components/ui";
import { PcoBlock } from "@/components/JobCardForm";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";

function Item({ k, v, className = "" }: { k: string; v?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold text-charcoal-500">{k}</div>
      <div className="min-h-5 text-sm font-medium whitespace-pre-line">{v || <span className="text-charcoal-300">—</span>}</div>
    </div>
  );
}

export default async function JobCardPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [j, settings] = await Promise.all([
    db.jobCard.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: { select: { id: true, number: true } },
        photos: { select: { id: true, kind: true }, orderBy: { sortOrder: "asc" } },
        invoices: { select: { id: true, number: true } },
        events: { select: { googleEventId: true } },
      },
    }),
    getSettings(),
  ]);
  if (!j) notFound();
  const onGoogle = j.events.some((e) => e.googleEventId);
  const before = j.photos.find((p) => p.kind === "BEFORE");
  const after = j.photos.find((p) => p.kind === "AFTER");
  const extras = j.photos.filter((p) => p.kind === "EXTRA");
  const ingredients = [...j.activeIngredients, ...(j.activeIngredientOther ? [j.activeIngredientOther] : [])];

  return (
    <div>
      <PageHeader
        back={{ href: `/customers/${j.customerId}?tab=jobcards`, label: j.customer.name }}
        title={<span className="flex items-center gap-3">{j.number} <StatusBadge status={j.status} /></span>}
        subtitle={[j.jobType, j.scheduledStart && fmtDateTime(j.scheduledStart), onGoogle && "On Google Calendar"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/job-cards/${j.id}/edit`} className="btn-primary">Edit / complete</Link>
            <form action={createInvoiceFromJobCard}>
              <input type="hidden" name="id" value={j.id} />
              <button className="btn-dark">Create invoice</button>
            </form>
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-charcoal-500">Mark as:</span>
        {(["IN_PROGRESS", "CANCELLED"] as const)
          .filter((s) => s !== j.status)
          .map((s) => (
            <form key={s} action={setJobCardStatus}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="status" value={s} />
              <button className="btn-outline py-1 text-xs">{s.replace("_", " ").toLowerCase()}</button>
            </form>
          ))}
        {j.status !== "COMPLETED" && (
          <Link href={`/job-cards/${j.id}/edit`} className="btn-outline py-1 text-xs">complete &amp; sign off</Link>
        )}
        <span className="ml-auto flex flex-wrap gap-3">
          {j.quotation && <Link href={`/quotations/${j.quotation.id}`} className="text-kudu-600 hover:underline">Quotation {j.quotation.number}</Link>}
          {j.invoices.map((i) => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="text-kudu-600 hover:underline">Invoice {i.number}</Link>
          ))}
        </span>
      </div>

      <article className="print-sheet card mx-auto max-w-3xl space-y-3 p-6 sm:p-8">
        <header className="flex items-center justify-between gap-4 border-b-4 border-kudu-600 pb-4">
          <Image src="/kudu-logo-sm.png" alt={settings.companyName} width={600} height={389} className="h-16 w-auto" />
          <div className="text-right">
            <h1 className="text-xl font-extrabold tracking-wide text-kudu-700 uppercase">{settings.jobCardTitle}</h1>
            {settings.jobCardSubtitle && <p className="text-xs text-charcoal-500 italic">{settings.jobCardSubtitle}</p>}
            <p className="mt-1 text-xs text-charcoal-600">
              {settings.companyName}
              {settings.phone && ` · ${settings.phone}`}
              {settings.email && ` · ${settings.email}`}
            </p>
          </div>
        </header>

        <NumberedSection n={1} title="JOB DETAILS">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Item k="Job no." v={j.number} />
            <Item k="Date" v={fmtDate(j.jobDate)} />
            <Item k="Technician" v={j.technician} />
            {j.jobType && <Item k="Job type" v={j.jobType} />}
            {j.scheduledStart && (
              <Item k="Scheduled" v={`${fmtDateTime(j.scheduledStart)}${j.scheduledEnd ? ` – ${fmtTime(j.scheduledEnd)}` : ""}`} />
            )}
            {j.quotation && <Item k="Quote ref." v={j.quotation.number} />}
            {j.scopeOfWork && <Item k="Scope / instructions" v={j.scopeOfWork} className="col-span-full" />}
          </div>
        </NumberedSection>

        <NumberedSection n={2} title="CLIENT DETAILS">
          <div className="grid grid-cols-2 gap-3">
            <Item k="Client name" v={j.customer.name} />
            <Item k="Contact number" v={j.contactNumber} />
            {j.customer.vatNumber && <Item k="VAT no." v={j.customer.vatNumber} />}
            {j.siteContact && <Item k="Site contact" v={j.siteContact} />}
            <Item k="Site address" v={j.siteAddress} className="col-span-2" />
          </div>
        </NumberedSection>

        <NumberedSection n={3} title="WORK PERFORMED">
          <div className="space-y-3">
            <Item k="Area / pest treated" v={j.areaTreated} />
            <Item k="Description of work done" v={j.workDescription} />
          </div>
        </NumberedSection>

        {j.photos.length > 0 && (
          <NumberedSection n={4} title="PHOTOS">
            <div className="grid grid-cols-2 gap-3">
              {[["BEFORE", before], ["AFTER", after]].map(([label, p]) =>
                p && typeof p === "object" ? (
                  <figure key={label as string}>
                    <figcaption className="mb-1 text-xs font-bold text-charcoal-600">{label as string}</figcaption>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/photos/${p.id}`} alt={label as string} className="aspect-[4/3] w-full rounded-md object-cover print:h-44" />
                  </figure>
                ) : null,
              )}
            </div>
            {extras.length > 0 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {extras.map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p.id} src={`/api/photos/${p.id}`} alt="Additional" className="aspect-square w-full rounded-md object-cover print:h-24" />
                ))}
              </div>
            )}
          </NumberedSection>
        )}

        <NumberedSection n={j.photos.length > 0 ? 5 : 4} title="WARRANTY DETAILS">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Item k="Warranty no." v={j.warrantyNo} />
              <Item k="Start date" v={fmtDate(j.warrantyStart)} />
              <Item k="End date" v={fmtDate(j.warrantyEnd)} />
            </div>
            <Item k="Warranty covers" v={j.warrantyCovers.join(", ")} />
            <div>
              <div className="text-xs font-semibold text-charcoal-500">Active ingredients</div>
              {ingredients.length ? (
                <ul className="list-disc pl-5 text-sm">{ingredients.map((a) => <li key={a}>{a}</li>)}</ul>
              ) : (
                <span className="text-charcoal-300">—</span>
              )}
            </div>
            <Item k="Comments / recommendations" v={j.warrantyComments} />
          </div>
        </NumberedSection>

        <NumberedSection n={j.photos.length > 0 ? 6 : 5} title="WARRANTY TERMS & CONDITIONS">
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
            {lines(settings.warrantyTerms).map((t) => <li key={t}>{t}</li>)}
          </ul>
        </NumberedSection>

        <NumberedSection n={j.photos.length > 0 ? 7 : 6} title="CLIENT SIGN-OFF">
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${j.clientConfirmed ? "border-kudu-600 bg-kudu-600 text-white" : "border-charcoal-400"}`}>
                {j.clientConfirmed ? "✓" : ""}
              </span>
              I confirm the work above was carried out to my satisfaction on the date shown, and I accept the Warranty Terms &amp; Conditions above.
            </p>
            <div className="grid grid-cols-2 items-end gap-4">
              <Item k="Signatory name" v={j.customerSignName} />
              <div>
                <div className="flex h-20 items-end border-b border-charcoal-400">
                  {j.customerSignature && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={j.customerSignature} alt="Client signature" className="max-h-20" />
                  )}
                </div>
                <div className="mt-1 text-xs text-charcoal-500">Client signature{j.signedAt && ` · signed ${fmtDateTime(j.signedAt)}`}</div>
              </div>
            </div>
            <PcoBlock settings={settings} />
          </div>
        </NumberedSection>
      </article>

      <form action={deleteJobCard} className="no-print mx-auto mt-6 max-w-3xl text-right">
        <input type="hidden" name="id" value={j.id} />
        <ConfirmButton message={`Delete job card ${j.number}, its photos and its calendar event?`}>Delete job card</ConfirmButton>
      </form>
    </div>
  );
}
