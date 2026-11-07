import { CompanyLogo } from "@/components/CompanyLogo";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { can, canAccessJobCard } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { lines } from "@/lib/jobcard";
import { createInvoiceFromJobCard, deleteJobCard, setJobCardStatus } from "@/app/actions/jobCards";
import { Flash, NumberedSection, PageHeader } from "@/components/ui";
import { JobStatusBadge } from "@/components/JobStatusBadge";
import { TimeSection } from "@/components/TimeSection";
import { StockSection } from "@/components/StockSection";
import { AssetChecksPrint, JobAssetsSection } from "@/components/Assets";
import { CUSTOM_PREFIX } from "@/lib/jobStatus";
import { parseItems } from "@/lib/checklists";
import { PcoBlock } from "@/components/JobCardForm";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";
import { branchContact } from "@/components/Document";
import { isOpen } from "@/lib/queries";
import { Stars } from "@/components/SignOff";

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
  const user = await requireUser();
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [j, settings] = await Promise.all([
    db.jobCard.findUnique({
      where: { id },
      include: {
        customer: { include: { branch: true } },
        quotation: { select: { id: true, number: true } },
        photos: { select: { id: true, kind: true }, orderBy: { sortOrder: "asc" } },
        customStatus: { select: { name: true, colour: true } },
        checklists: { orderBy: { sortOrder: "asc" } },
        invoices: { select: { id: true, number: true, status: true } },
        timeEntries: { orderBy: { start: "asc" }, include: { invoice: { select: { id: true, number: true } } } },
        events: { select: { googleEventId: true } },
        queries: { select: { id: true, number: true, status: true }, orderBy: { createdAt: "asc" } },
        assetChecks: { include: { asset: true }, orderBy: [{ asset: { code: "asc" } }, { asset: { name: "asc" } }] },
        stockMovements: {
          where: { kind: "USE" },
          orderBy: { createdAt: "asc" },
          include: {
            item: { select: { id: true, name: true, unit: true, sellPrice: true } },
            fromLocation: { select: { name: true } },
            invoice: { select: { id: true, number: true } },
          },
        },
      },
    }),
    getSettings(),
  ]);
  if (!j) notFound();
  if (!canAccessJobCard(user, j)) redirect("/no-access?need=jobcards.viewAll");
  const may = (p: Parameters<typeof can>[1]) => can(user.role, p);
  const onGoogle = j.events.some((e) => e.googleEventId);
  const before = j.photos.find((p) => p.kind === "BEFORE");
  const after = j.photos.find((p) => p.kind === "AFTER");
  const extras = j.photos.filter((p) => p.kind === "EXTRA");
  const customStatuses = await db.jobStatus.findMany({
    where: { active: true, id: { not: j.statusId ?? "" }, ...(may("jobcards.assign") ? {} : { stage: { not: "CANCELLED" } }) },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  const people = may("time.manageAll")
    ? (await db.user.findMany({ where: { disabled: false }, select: { id: true, name: true, email: true, labourRate: true }, orderBy: { name: "asc" } })).map((u) => ({
        id: u.id,
        name: u.name || u.email || "",
        labourRate: u.labourRate,
      }))
    : [];
  // Stock can be booked out of any location by the office, and only out of their own van by a technician.
  const [stockLocations, stockItems, customerAssets] = await Promise.all([
    db.stockLocation.findMany({
      where: { active: true, ...(may("inventory.manage") ? {} : { type: "VAN", userId: user.id }) },
      select: { id: true, name: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    db.stockItem.findMany({ where: { active: true }, select: { id: true, name: true, unit: true, levels: { select: { locationId: true, quantity: true } } }, orderBy: { name: "asc" } }),
    db.customerAsset.findMany({ where: { customerId: j.customerId }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
  ]);
  const checklists = j.checklists.map((l) => ({ ...l, items: parseItems(l.items) }));
  // Section numbers shift with the optional sections.
  let section = 3;
  const next = () => ++section;
  const contact = branchContact(settings, j.customer.branch);
  const ingredients = [...j.activeIngredients, ...(j.activeIngredientOther ? [j.activeIngredientOther] : [])];

  return (
    <div>
      <PageHeader
        back={may("customers.view") ? { href: `/customers/${j.customerId}?tab=jobcards`, label: j.customer.name } : { href: "/job-cards", label: "My Job Cards" }}
        title={<span className="flex items-center gap-3">{j.number} <JobStatusBadge status={j.status} custom={j.customStatus} /></span>}
        subtitle={[j.jobType, j.scheduledStart && fmtDateTime(j.scheduledStart), onGoogle && "On Google Calendar"].filter(Boolean).join(" · ")}
        actions={
          <>
            <Link href={`/job-cards/${j.id}/edit`} className="btn-primary">Edit / complete</Link>
            {may("invoices.edit") && (
              <form action={createInvoiceFromJobCard}>
                <input type="hidden" name="id" value={j.id} />
                <button className="btn-dark">Create invoice</button>
              </form>
            )}
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="no-print mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-charcoal-500">Mark as:</span>
        {(["IN_PROGRESS", "CANCELLED"] as const)
          .filter((s) => s !== j.status && (s !== "CANCELLED" || may("jobcards.assign")))
          .map((s) => (
            <form key={s} action={setJobCardStatus}>
              <input type="hidden" name="id" value={j.id} />
              <input type="hidden" name="status" value={s} />
              <button className="btn-outline py-1 text-xs">{s.replace("_", " ").toLowerCase()}</button>
            </form>
          ))}
        {j.status !== "COMPLETED" && j.status !== "CANCELLED" && may("jobcards.edit") && (
          <Link href={`/sign/${j.id}`} className="btn-primary py-1 text-xs">Client sign-off on this phone</Link>
        )}
        {customStatuses.length > 0 && (
          <form action={setJobCardStatus} className="flex items-center gap-1">
            <input type="hidden" name="id" value={j.id} />
            <select name="status" className="input w-auto py-1 text-xs" aria-label="Custom status" defaultValue="">
              <option value="" disabled>Other status…</option>
              {customStatuses.map((c) => <option key={c.id} value={`${CUSTOM_PREFIX}${c.id}`}>{c.name}</option>)}
            </select>
            <button className="btn-outline py-1 text-xs">Set</button>
          </form>
        )}
        <span className="ml-auto flex flex-wrap gap-3">
          {j.quotation && may("quotations.view") && <Link href={`/quotations/${j.quotation.id}`} className="text-kudu-600 hover:underline">Quotation {j.quotation.number}</Link>}
          {may("queries.view") && j.queries.map((qr) => (
            <Link key={qr.id} href={`/queries/${qr.id}`} className="text-kudu-600 hover:underline">Query {qr.number}{isOpen(qr.status) ? " (open)" : ""}</Link>
          ))}
          {may("queries.edit") && <Link href={`/queries/new?customerId=${j.customerId}&jobCardId=${j.id}`} className="text-charcoal-500 hover:text-kudu-600">+ Log query</Link>}
          {may("invoices.view") && j.invoices.map((i) => (
            <Link key={i.id} href={`/invoices/${i.id}`} className="text-kudu-600 hover:underline">Invoice {i.number}</Link>
          ))}
        </span>
      </div>

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
            {(j.customerRating || j.customerFeedback) && (
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

      <TimeSection
        jobCardId={j.id}
        entries={j.timeEntries}
        user={user}
        people={people}
        settings={settings}
        hasDraftInvoice={j.invoices.some((i) => i.status === "DRAFT")}
      />

      <JobAssetsSection jobCardId={j.id} assets={customerAssets} checks={j.assetChecks} />

      <StockSection
        jobCardId={j.id}
        used={j.stockMovements}
        user={user}
        locations={stockLocations}
        items={stockItems.map((i) => ({ id: i.id, name: i.name, unit: i.unit, onHand: Object.fromEntries(i.levels.map((l) => [l.locationId, l.quantity])) }))}
        hasDraftInvoice={j.invoices.some((i) => i.status === "DRAFT")}
        symbol={settings.currencySymbol}
      />

      {may("jobcards.delete") && (
        <form action={deleteJobCard} className="no-print mx-auto mt-6 max-w-3xl text-right">
          <input type="hidden" name="id" value={j.id} />
          <ConfirmButton message={`Delete job card ${j.number}, its photos and its calendar event?`}>Delete job card</ConfirmButton>
        </form>
      )}
    </div>
  );
}
