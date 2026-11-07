import type { Customer, JobCard, JobCardPhoto, JobStatus, Product, Settings } from "@prisma/client";
import { saveJobCard } from "@/app/actions/jobCards";
import { toDateInput, toDateTimeInput } from "@/lib/format";
import { JOB_TYPES, MAX_EXTRA_PHOTOS, lines, productLabel } from "@/lib/jobcard";
import { JobCardSubmit, PhotoPicker, SignaturePad, WarrantyDates } from "./JobCardEditors";
import { Field, NumberedSection } from "./ui";
import { TechnicianPicker, type Assignee } from "./TechnicianPicker";
import { ChecklistEditor, type TemplateOption } from "./ChecklistEditor";
import { CUSTOM_PREFIX, STAGES } from "@/lib/jobStatus";
import type { ChecklistInput } from "@/lib/checklists";

export type JobCardDefaults = Partial<
  Pick<JobCard, "customerId" | "siteAddress" | "siteContact" | "contactNumber" | "scopeOfWork" | "quotationId">
>;

export function JobCardForm({
  jobCard,
  customers,
  products,
  settings,
  defaults,
  assignees = [],
  canAssign = true,
  statuses = [],
  templates = [],
  checklists = [],
}: {
  jobCard?: JobCard & { photos: Pick<JobCardPhoto, "id" | "kind">[] };
  customers: Pick<Customer, "id" | "name">[];
  products: Product[];
  settings: Settings;
  defaults?: JobCardDefaults;
  /** Users the job can be assigned to. */
  assignees?: Assignee[];
  /** False for technicians: who, for whom, when and what are set by the office and shown read-only. */
  canAssign?: boolean;
  /** Active custom statuses, plus the job card's current one. */
  statuses?: Pick<JobStatus, "id" | "name" | "stage">[];
  /** Checklist templates that can be added; auto ones are added to new job cards. */
  templates?: TemplateOption[];
  /** The job card's checklists. */
  checklists?: ChecklistInput[];
}) {
  const j = jobCard;
  const lock = !canAssign;
  const covers = lines(settings.warrantyCovers);
  const productLabels = products.map(productLabel);
  // Keep ingredients ticked on older cards even if the product was since removed from Settings.
  const legacyIngredients = (j?.activeIngredients ?? []).filter((a) => !productLabels.includes(a));

  return (
    <form action={saveJobCard} className="mx-auto max-w-3xl space-y-4">
      {j && <input type="hidden" name="id" value={j.id} />}
      {!j && defaults?.quotationId && <input type="hidden" name="quotationId" value={defaults.quotationId} />}

      <NumberedSection n={1} title="JOB DETAILS">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job no.">
            <input className="input bg-charcoal-50" value={j?.number ?? "Assigned when saved"} readOnly />
          </Field>
          <Field label="Date">
            <input name="jobDate" type="date" className="input" defaultValue={toDateInput(j?.jobDate ?? j?.scheduledStart ?? new Date())} />
          </Field>
          <TechnicianPicker assignees={assignees} technicianId={j?.technicianId} technician={j?.technician} disabled={lock} />
          <Field label="Job type">
            <input name="jobType" list="job-types" className="input" defaultValue={j?.jobType} disabled={lock} />
            <datalist id="job-types">{JOB_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="Scheduled start">
            <input name="scheduledStart" type="datetime-local" className="input" defaultValue={toDateTimeInput(j?.scheduledStart)} disabled={lock} />
          </Field>
          <Field label="Scheduled end">
            <input name="scheduledEnd" type="datetime-local" className="input" defaultValue={toDateTimeInput(j?.scheduledEnd)} disabled={lock} />
          </Field>
          <Field label="Status">
            <select name="status" className="input" defaultValue={j?.statusId ? `${CUSTOM_PREFIX}${j.statusId}` : (j?.status ?? "SCHEDULED")}>
              {STAGES.filter((st) => canAssign || st.value !== "CANCELLED" || j?.status === "CANCELLED").map((st) => {
                const customs = statuses.filter((c) => c.stage === st.value);
                return (
                  <optgroup key={st.value} label={st.label}>
                    <option value={st.value} data-stage={st.value}>{st.label}</option>
                    {customs.map((c) => <option key={c.id} value={`${CUSTOM_PREFIX}${c.id}`} data-stage={c.stage}>{c.name}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </Field>
          <Field label="Priority">
            <select name="priority" className="input" defaultValue={j?.priority ?? "Normal"} disabled={lock}>
              {["Low", "Normal", "High", "Urgent"].map((p) => <option key={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Scope / instructions" className="sm:col-span-2">
            <textarea name="scopeOfWork" rows={3} className="input" defaultValue={j?.scopeOfWork ?? defaults?.scopeOfWork} disabled={lock} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-charcoal-500">
          {lock
            ? "The office sets who does the job, when, and the scope. Ask them if something here is wrong."
            : "A scheduled job appears on the calendar and, once connected, in Google Calendar. The assigned user sees it under My Job Cards."}
        </p>
      </NumberedSection>

      <NumberedSection n={2} title="CLIENT DETAILS">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name *" className="sm:col-span-2">
            <select name="customerId" required className="input" defaultValue={j?.customerId ?? defaults?.customerId ?? ""} disabled={lock}>
              <option value="" disabled>Choose a customer…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Contact number">
            <input name="contactNumber" type="tel" className="input" defaultValue={j?.contactNumber ?? defaults?.contactNumber} placeholder="e.g. 082 123 4567" disabled={lock} />
          </Field>
          <Field label="Site contact person">
            <input name="siteContact" className="input" defaultValue={j?.siteContact ?? defaults?.siteContact} disabled={lock} />
          </Field>
          <Field label="Site address" className="sm:col-span-2">
            <textarea name="siteAddress" rows={2} className="input" defaultValue={j?.siteAddress ?? defaults?.siteAddress} placeholder="Physical address of the job" disabled={lock} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-charcoal-500">The client&apos;s VAT number is taken from their customer profile.</p>
      </NumberedSection>

      <NumberedSection n={3} title="WORK PERFORMED">
        <div className="space-y-4">
          <Field label="Area / pest treated">
            <input name="areaTreated" className="input" defaultValue={j?.areaTreated} placeholder="e.g. Kitchen, roof void – Cockroaches" />
          </Field>
          <Field label="Description of work done">
            <textarea name="workDescription" rows={5} className="input" defaultValue={j?.workDescription} placeholder="Describe the treatment, products used, findings and recommendations" />
          </Field>
        </div>
      </NumberedSection>

      <NumberedSection n={4} title="CHECKLISTS">
        <ChecklistEditor initial={checklists} templates={templates} />
      </NumberedSection>

      <NumberedSection n={5} title="PHOTOS">
        <PhotoPicker initial={(j?.photos ?? []).map((p) => ({ id: p.id, kind: p.kind }))} maxExtra={MAX_EXTRA_PHOTOS} />
      </NumberedSection>

      <NumberedSection n={6} title="WARRANTY DETAILS">
        <div className="space-y-4">
          <Field label="Warranty no.">
            <input name="warrantyNo" className="input" defaultValue={j?.warrantyNo} placeholder="Defaults to the job no." />
          </Field>
          <WarrantyDates start={toDateInput(j?.warrantyStart)} end={toDateInput(j?.warrantyEnd)} months={settings.warrantyMonths} />
          <div>
            <span className="label">Warranty covers</span>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {covers.map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="warrantyCovers" value={c} defaultChecked={j?.warrantyCovers.includes(c)} className="h-4 w-4 accent-kudu-600" />
                  {c}
                </label>
              ))}
            </div>
          </div>
          <div>
            <span className="label">
              Active ingredients <span className="font-normal normal-case">(registered products used)</span>
            </span>
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-charcoal-200 bg-charcoal-50 p-2">
              {[...products.map((p) => ({ key: p.id, label: productLabel(p), p })), ...legacyIngredients.map((l) => ({ key: l, label: l, p: null }))].map(({ key, label, p }) => (
                <label key={key} className="flex items-start gap-2 rounded p-1 text-sm hover:bg-white">
                  <input type="checkbox" name="activeIngredients" value={label} defaultChecked={j?.activeIngredients.includes(label)} className="mt-0.5 h-4 w-4 shrink-0 accent-kudu-600" />
                  <span>
                    <span className="font-medium">{p ? p.name : label}</span>
                    {p?.activeIngredient && <span className="text-charcoal-500"> — {p.activeIngredient}</span>}
                    {p?.regNumber && <span className="ml-1 text-xs font-semibold whitespace-nowrap text-kudu-700">Reg. {p.regNumber}</span>}
                  </span>
                </label>
              ))}
              {products.length === 0 && legacyIngredients.length === 0 && (
                <p className="p-2 text-sm text-charcoal-500">No products yet. Add them in Settings → Products.</p>
              )}
            </div>
            <Field label="Other (not listed above)" className="mt-3">
              <input name="activeIngredientOther" className="input" defaultValue={j?.activeIngredientOther} placeholder="e.g. Deltamethrin" />
            </Field>
          </div>
          <Field label="Comments / recommendations">
            <textarea name="warrantyComments" rows={3} className="input" defaultValue={j?.warrantyComments} placeholder="Any additional comments or recommendations for the client" />
          </Field>
        </div>
      </NumberedSection>

      <NumberedSection n={7} title="WARRANTY TERMS & CONDITIONS">
        <ul className="list-disc space-y-1.5 rounded-r-md border-l-4 border-kudu-600 bg-kudu-50 py-3 pr-3 pl-8 text-sm">
          {lines(settings.warrantyTerms).map((t) => <li key={t}>{t}</li>)}
        </ul>
      </NumberedSection>

      <NumberedSection n={8} title="CLIENT SIGN-OFF">
        <div className="space-y-4">
          <label className="flex items-start gap-3 rounded-md border border-kudu-100 bg-kudu-50 p-3 text-sm">
            <input type="checkbox" name="clientConfirmed" defaultChecked={j?.clientConfirmed} className="mt-0.5 h-5 w-5 shrink-0 accent-kudu-600" />
            I confirm the work above was carried out to my satisfaction on the date shown, and I accept the Warranty Terms &amp; Conditions above.
          </label>
          <Field label="Signatory name">
            <input name="customerSignName" className="input" defaultValue={j?.customerSignName} placeholder="Name of person signing" />
          </Field>
          <SignaturePad name="customerSignature" label="Client signature" initial={j?.customerSignature} />
          <PcoBlock settings={settings} />
        </div>
      </NumberedSection>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-charcoal-200 bg-charcoal-50/95 px-4 py-3 backdrop-blur md:mx-0 md:rounded-lg md:border">
        <JobCardSubmit />
      </div>
    </form>
  );
}

export function PcoBlock({ settings }: { settings: Pick<Settings, "pcoNumber" | "pcoSignature"> }) {
  if (!settings.pcoNumber && !settings.pcoSignature) return null;
  return (
    <div className="flex items-center gap-4 border-t border-charcoal-100 pt-4">
      {settings.pcoSignature && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={settings.pcoSignature} alt="PCO signature" className="h-12 w-auto" />
      )}
      {settings.pcoNumber && (
        <div className="text-sm text-charcoal-500">
          <b className="text-charcoal-800">PCO No.</b> {settings.pcoNumber}
        </div>
      )}
    </div>
  );
}
