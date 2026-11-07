import type { Prisma, Settings } from "@prisma/client";
import { CompanyLogo } from "@/components/CompanyLogo";
import { NumberedSection } from "@/components/ui";
import { PcoBlock } from "@/components/JobCardForm";
import { AssetChecksPrint } from "@/components/Assets";
import { branchContact } from "@/components/Document";
import { Stars } from "@/components/SignOff";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { lines } from "@/lib/jobcard";
import { parseItems } from "@/lib/checklists";

/** What the printed job card needs loaded with the job card. */
export const jobCardSheetInclude = {
  customer: { include: { branch: true } },
  quotation: { select: { id: true, number: true } },
  photos: { select: { id: true, kind: true }, orderBy: { sortOrder: "asc" } },
  checklists: { orderBy: { sortOrder: "asc" } },
  assetChecks: { include: { asset: true }, orderBy: [{ asset: { code: "asc" } }, { asset: { name: "asc" } }] },
} satisfies Prisma.JobCardInclude;

export type JobCardForSheet = Prisma.JobCardGetPayload<{ include: typeof jobCardSheetInclude }>;

function Item({ k, v, className = "" }: { k: string; v?: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-semibold text-charcoal-500">{k}</div>
      <div className="min-h-5 text-sm font-medium whitespace-pre-line">{v || <span className="text-charcoal-300">—</span>}</div>
    </div>
  );
}

/**
 * The Job Card & Service Warranty as printed, shared by the staff job card page and the customer portal.
 * `showFeedback` adds the client's sign-off rating and comment (on screen only).
 */
export function JobCardSheet({ j, settings, showFeedback = false }: { j: JobCardForSheet; settings: Settings; showFeedback?: boolean }) {
  const before = j.photos.find((p) => p.kind === "BEFORE");
  const after = j.photos.find((p) => p.kind === "AFTER");
  const extras = j.photos.filter((p) => p.kind === "EXTRA");
  const checklists = j.checklists.map((l) => ({ ...l, items: parseItems(l.items) }));
  // Section numbers shift with the optional sections.
  let section = 3;
  const next = () => ++section;
  const contact = branchContact(settings, j.customer.branch);
  const ingredients = [...j.activeIngredients, ...(j.activeIngredientOther ? [j.activeIngredientOther] : [])];
  return (
    <article className="print-sheet card mx-auto max-w-3xl space-y-3 p-6 sm:p-8">
      <header className="flex items-center justify-between gap-4 border-b-4 border-kudu-600 pb-4">
        <CompanyLogo logo={settings.logo} name={settings.companyName} className="h-16 w-auto" />
        <div className="text-right">
          <h1 className="text-xl font-extrabold tracking-wide text-kudu-700 uppercase">{settings.jobCardTitle}</h1>
          {settings.jobCardSubtitle && <p className="text-xs text-charcoal-500 italic">{settings.jobCardSubtitle}</p>}
          <p className="mt-1 text-xs text-charcoal-600">
            {settings.companyName}
            {j.customer.branch && ` · ${j.customer.branch.name} branch`}
            {contact.phone && ` · ${contact.phone}`}
            {contact.email && ` · ${contact.email}`}
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

      {checklists.length > 0 && (
        <NumberedSection n={next()} title="CHECKLISTS">
          <div className="space-y-3">
            {checklists.map((l) => (
              <div key={l.id}>
                <div className="mb-1 text-xs font-bold text-charcoal-600">
                  {l.name} · {l.items.filter((i) => i.done).length}/{l.items.length}
                </div>
                <ul className="space-y-0.5 text-sm">
                  {l.items.map((it, k) => (
                    <li key={k} className="flex items-start gap-2">
                      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border text-[10px] ${it.done ? "border-kudu-600 bg-kudu-600 text-white" : "border-charcoal-400"}`}>
                        {it.done ? "✓" : ""}
                      </span>
                      <span>
                        {it.label}
                        {it.note && <span className="text-charcoal-500"> · {it.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </NumberedSection>
      )}

      {j.assetChecks.length > 0 && (
        <NumberedSection n={next()} title="SITE ASSETS CHECKED">
          <AssetChecksPrint checks={j.assetChecks} />
        </NumberedSection>
      )}

      {j.photos.length > 0 && (
        <NumberedSection n={next()} title="PHOTOS">
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

      <NumberedSection n={next()} title="WARRANTY DETAILS">
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

      <NumberedSection n={next()} title="WARRANTY TERMS & CONDITIONS">
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed">
          {lines(settings.warrantyTerms).map((t) => <li key={t}>{t}</li>)}
        </ul>
      </NumberedSection>

      <NumberedSection n={next()} title="CLIENT SIGN-OFF">
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
          {showFeedback && (j.customerRating || j.customerFeedback) && (
            <div className="no-print rounded-md bg-charcoal-50 p-3 text-sm">
              <div className="text-xs font-semibold text-charcoal-500">Client feedback at sign-off (not printed)</div>
              {j.customerRating && <div className="text-lg"><Stars rating={j.customerRating} /></div>}
              {j.customerFeedback && <p className="whitespace-pre-line italic">“{j.customerFeedback}”</p>}
            </div>
          )}
          <PcoBlock settings={settings} />
        </div>
      </NumberedSection>
    </article>
  );
}
