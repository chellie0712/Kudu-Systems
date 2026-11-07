import { authDisabled, requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { googleConfigured } from "@/lib/google";
import {
  deleteChecklistTemplate,
  deleteJobStatus,
  deleteProduct,
  disconnectGoogleCalendar,
  saveChecklistTemplate,
  saveJobStatus,
  saveProduct,
  saveSettings,
  useMyGoogleCalendar,
} from "@/app/actions/settings";
import { STAGES, STATUS_COLOURS, colourClass } from "@/lib/jobStatus";
import { JOB_TYPES } from "@/lib/jobcard";
import { SignaturePad } from "@/components/JobCardEditors";
import { addUser, resetPassword, setUserDisabled, setUserLabourRate, setUserRole } from "@/app/actions/users";
import { centsToInput } from "@/lib/format";
import { PERMISSION_TABLE, ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS, can } from "@/lib/permissions";
import { ConfirmButton } from "@/components/ConfirmButton";
import { deleteBranch, saveBranch, setUserBranch } from "@/app/actions/branches";
import { LogoInput } from "@/components/LogoInput";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { googleAdsConfigured } from "@/lib/googleAds";
import { disconnectGoogleAds, saveGoogleAdsAccount, syncGoogleAdsNow } from "@/app/actions/marketing";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const db = await tenantDb();
  const user = await requirePermission("settings.manage");
  const { msg, err } = await searchParams;
  const s = await getSettings();
  const users = await db.user.findMany({ orderBy: { createdAt: "asc" } });
  const branches = await db.branch.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { customers: true, users: true } } } });
  const products = await db.product.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const jobStatuses = await db.jobStatus.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { jobCards: true } } } });
  const templates = await db.checklistTemplate.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const stageSelect = (value?: string) => (
    <select name="stage" defaultValue={value ?? "IN_PROGRESS"} className="input w-40 flex-none" aria-label="Stage">
      {STAGES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
    </select>
  );
  const colourSelect = (value?: string) => (
    <select name="colour" defaultValue={value ?? "slate"} className="input w-32 flex-none" aria-label="Colour">
      {Object.entries(STATUS_COLOURS).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
    </select>
  );
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
            <div className="md:col-span-2">
              <span className="label">Logo (shown in the menu bar and printed on quotations, job cards and invoices)</span>
              <LogoInput initial={s.logo} />
            </div>
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
            {text("queryPrefix", "Query prefix")}
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
            Next numbers: {s.quotePrefix}{String(s.nextQuoteNo).padStart(4, "0")}, {s.jobCardPrefix}{String(s.nextJobCardNo).padStart(4, "0")}, {s.invoicePrefix}{String(s.nextInvoiceNo).padStart(4, "0")}, {s.queryPrefix}{String(s.nextQueryNo).padStart(4, "0")}
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
        <section id="approval">
          <SectionTitle>Invoice approval</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" name="invoiceApproval" defaultChecked={s.invoiceApproval} className="h-4 w-4 accent-kudu-600" />
              Invoices must be approved by an admin before they can be marked as sent
            </label>
            <Field label={`Only invoices from (${s.currencySymbol}, incl. VAT)`}>
              <input name="invoiceApprovalThreshold" inputMode="decimal" className="input" defaultValue={centsToInput(s.invoiceApprovalThreshold)} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-charcoal-500">
            0 means every invoice. Office staff press “Submit for approval”; admins approve or send it back with a reason. If the total changes after approval, it needs approving again.
          </p>
        </section>
        <section id="labour">
          <SectionTitle>Labour billing</SectionTitle>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={`Hourly rate excl. VAT (${s.currencySymbol})`}>
              <input name="labourRate" inputMode="decimal" className="input" defaultValue={centsToInput(s.labourRate)} />
            </Field>
            <Field label="Invoice line description">
              <input name="labourDescription" className="input" defaultValue={s.labourDescription} />
            </Field>
            <Field label="Round time up to (minutes)">
              <input name="labourRoundMinutes" type="number" min={0} max={60} className="input" defaultValue={s.labourRoundMinutes} />
            </Field>
          </div>
          <p className="mt-2 text-xs text-charcoal-500">
            Time recorded on job cards is added to the invoice at this rate. A person can have their own rate under Users &amp; roles. Rounding is per person per invoice; 0 bills exact minutes.
          </p>
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

      <div id="users" className="card mt-6 p-6">
        <SectionTitle>Users &amp; roles</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">
          People who can sign in with email and password. Passwords need at least 10 characters. A company always keeps at least one active admin.
        </p>
        <div className="divide-y divide-charcoal-100">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{u.name} {u.id === user.id && <span className="text-xs text-charcoal-500">(you)</span>}</div>
                <div className="text-xs text-charcoal-500">{u.email}{u.disabled && " · disabled"}{!u.passwordHash && " · Google only"}</div>
              </div>
              <form action={setUserRole} className="flex gap-2">
                <input type="hidden" name="id" value={u.id} />
                <select name="role" defaultValue={u.role} className="input w-36 py-1.5" aria-label={`Role of ${u.email}`}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <button className="btn-outline py-1.5">Set role</button>
              </form>
              {branches.length > 0 && (
                <form action={setUserBranch} className="flex gap-2">
                  <input type="hidden" name="id" value={u.id} />
                  <select name="branchId" defaultValue={u.branchId ?? ""} className="input w-36 py-1.5" aria-label={`Branch of ${u.email}`} title="Home branch: what the lists show when they sign in">
                    <option value="">No branch</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <button className="btn-outline py-1.5">Set branch</button>
                </form>
              )}
              <form action={setUserLabourRate} className="flex gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input
                  name="labourRate"
                  inputMode="decimal"
                  className="input w-28 py-1.5"
                  defaultValue={u.labourRate == null ? "" : centsToInput(u.labourRate)}
                  placeholder={`${s.currencySymbol}/h`}
                  aria-label={`Hourly rate of ${u.email}`}
                  title="Own hourly labour rate; leave empty for the company rate"
                />
                <button className="btn-outline py-1.5">Set rate</button>
              </form>
              <form action={resetPassword} className="flex gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input name="password" type="password" minLength={10} className="input w-44 py-1.5" placeholder="New password" autoComplete="new-password" required />
                <button className="btn-outline py-1.5">Set password</button>
              </form>
              {u.id !== user.id && (
                <form action={setUserDisabled}>
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="disabled" value={String(!u.disabled)} />
                  <button className={u.disabled ? "btn-outline py-1.5" : "btn-danger py-1.5"}>{u.disabled ? "Enable" : "Disable"}</button>
                </form>
              )}
            </div>
          ))}
        </div>
        <form action={addUser} className="mt-4 flex flex-wrap items-end gap-2">
          <input name="name" className="input w-44 flex-none" placeholder="Name" />
          <input name="email" type="email" className="input w-56 flex-none" placeholder="Email" required />
          <input name="password" type="password" minLength={10} className="input w-44 flex-none" placeholder="Password" autoComplete="new-password" required />
          <select name="role" defaultValue="OFFICE" className="input w-36 flex-none" aria-label="Role">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
          <button className="btn-primary py-1.5">+ Add user</button>
        </form>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="mb-2 text-left text-xs font-semibold uppercase tracking-wide text-charcoal-500">What each role can do</caption>
            <thead>
              <tr className="border-b border-charcoal-200 text-left">
                <th className="py-1.5 pr-3 font-semibold"></th>
                {ROLES.map((r) => <th key={r} className="px-3 py-1.5 text-center font-semibold">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {PERMISSION_TABLE.map((row) => (
                <tr key={row.label} className="border-b border-charcoal-100">
                  <td className="py-1.5 pr-3">{row.label}</td>
                  {ROLES.map((r) => (
                    <td key={r} className="px-3 py-1.5 text-center">
                      {row.note?.[r] ? (
                        <span className="text-xs font-medium text-charcoal-600">{row.note[r]}</span>
                      ) : can(r, row.permission) ? (
                        <span className="font-bold text-kudu-600" aria-label="Yes">✓</span>
                      ) : (
                        <span className="text-charcoal-300" aria-label="No">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 space-y-1 text-xs text-charcoal-500">
            {ROLES.map((r) => <li key={r}><b className="text-charcoal-700">{ROLE_LABELS[r]}:</b> {ROLE_DESCRIPTIONS[r]}</li>)}
          </ul>
          <p className="mt-2 text-xs text-charcoal-500">To give a technician a job, choose them under “Assigned to” on the job card.</p>
        </div>
      </div>

      <div id="statuses" className="card mt-6 p-6">
        <SectionTitle>Job statuses</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">
          Your own statuses, e.g. “Awaiting parts”. Each belongs to a stage (Scheduled, In progress, Completed or Cancelled), which decides where the job counts on the dashboard and calendar.
          Deleting a status puts its job cards back on their stage.
        </p>
        <div className="space-y-2">
          {jobStatuses.map((st) => (
            <div key={st.id} className="flex flex-wrap items-end gap-2 border-b border-charcoal-100 pb-2">
              <form action={saveJobStatus} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={st.id} />
                <span className={`inline-block w-3 self-stretch rounded ${colourClass(st.colour)}`} aria-hidden />
                <input name="name" className="input min-w-48 flex-1" defaultValue={st.name} aria-label="Status name" />
                {stageSelect(st.stage)}
                {colourSelect(st.colour)}
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={st.active} className="accent-kudu-600" /> Show</label>
                <span className="text-xs text-charcoal-500">{st._count.jobCards} job{st._count.jobCards === 1 ? "" : "s"}</span>
                <button className="btn-outline py-1.5">Save</button>
              </form>
              <form action={deleteJobStatus}>
                <input type="hidden" name="id" value={st.id} />
                <ConfirmButton message={`Delete the status “${st.name}”? Its job cards keep their stage.`} className="btn-danger py-1.5">Delete</ConfirmButton>
              </form>
            </div>
          ))}
        </div>
        <form action={saveJobStatus} className="mt-4 flex flex-wrap items-end gap-2">
          <input name="name" className="input min-w-48 flex-1" placeholder="New status, e.g. Awaiting parts" required />
          {stageSelect()}
          {colourSelect()}
          <button className="btn-primary py-1.5">+ Add status</button>
        </form>
      </div>

      <div id="checklists" className="card mt-6 p-6">
        <SectionTitle>Forms &amp; checklists</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">
          Checklists are filled in on the job card and printed on it. Add one to every job card, to one job type, or leave both off and add it by hand.
          Changing a checklist here does not change job cards that already have it.
        </p>
        <div className="space-y-4">
          {templates.map((t) => (
            <div key={t.id} className="rounded-md border border-charcoal-200 p-3">
              <form action={saveChecklistTemplate} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={t.id} />
                <Field label="Name"><input name="name" className="input" defaultValue={t.name} required /></Field>
                <Field label="Add automatically to job type (optional)">
                  <input name="jobType" list="checklist-job-types" className="input" defaultValue={t.jobType} />
                </Field>
                <Field label="Items (one per line)" className="md:col-span-2">
                  <textarea name="items" rows={Math.min(10, Math.max(3, t.items.split("\n").length + 1))} className="input" defaultValue={t.items} />
                </Field>
                <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
                  <label className="flex items-center gap-2"><input type="checkbox" name="autoAddAll" defaultChecked={t.autoAddAll} className="accent-kudu-600" /> Add to every job card</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="requiredForCompletion" defaultChecked={t.requiredForCompletion} className="accent-kudu-600" /> All items must be ticked to complete the job</label>
                  <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={t.active} className="accent-kudu-600" /> Show</label>
                  <button className="btn-outline ml-auto py-1.5">Save checklist</button>
                </div>
              </form>
              <form action={deleteChecklistTemplate} className="mt-2 text-right">
                <input type="hidden" name="id" value={t.id} />
                <ConfirmButton message={`Delete the checklist “${t.name}”? Job cards keep their filled-in copy.`} className="text-xs text-charcoal-400 hover:text-kudu-600">Delete checklist</ConfirmButton>
              </form>
            </div>
          ))}
        </div>
        <form action={saveChecklistTemplate} className="mt-4 grid gap-3 rounded-md border border-dashed border-charcoal-300 p-3 md:grid-cols-2">
          <Field label="New checklist name"><input name="name" className="input" placeholder="e.g. Rodent station inspection" required /></Field>
          <Field label="Add automatically to job type (optional)">
            <input name="jobType" list="checklist-job-types" className="input" />
          </Field>
          <Field label="Items (one per line)" className="md:col-span-2">
            <textarea name="items" rows={4} className="input" required />
          </Field>
          <div className="flex flex-wrap items-center gap-4 text-sm md:col-span-2">
            <label className="flex items-center gap-2"><input type="checkbox" name="autoAddAll" className="accent-kudu-600" /> Add to every job card</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="requiredForCompletion" className="accent-kudu-600" /> All items must be ticked to complete the job</label>
            <button className="btn-primary ml-auto py-1.5">+ Add checklist</button>
          </div>
        </form>
        <datalist id="checklist-job-types">{JOB_TYPES.map((jt) => <option key={jt} value={jt} />)}</datalist>
      </div>

      <div id="branches" className="card mt-6 p-6">
        <SectionTitle>Branches</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">
          Optional. Each customer can belong to a branch, and its quotations, job cards and invoices follow the customer. Once a branch exists, a
          branch switcher appears at the top of every page to filter the lists, calendar and dashboard; each person starts on their home branch
          (set under Users &amp; roles). A branch&apos;s address, phone and email print on its customers&apos; documents instead of the company&apos;s.
        </p>
        <div className="space-y-3">
          {branches.map((b) => (
            <div key={b.id} className="border-b border-charcoal-100 pb-3">
              <form action={saveBranch} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={b.id} />
                <input name="name" required className="input w-40 flex-none" defaultValue={b.name} aria-label="Branch name" />
                <input name="phone" className="input w-36 flex-none" defaultValue={b.phone} placeholder="Phone" aria-label={`Phone of ${b.name}`} />
                <input name="email" type="email" className="input w-52 flex-none" defaultValue={b.email} placeholder="Email" aria-label={`Email of ${b.name}`} />
                <input name="sortOrder" type="number" className="input w-16 flex-none" defaultValue={b.sortOrder} aria-label="Order" title="Order in lists" />
                <textarea name="address" rows={2} className="input min-w-60 flex-1" defaultValue={b.address} placeholder="Address" aria-label={`Address of ${b.name}`} />
                <label className="flex items-center gap-1 pb-2 text-xs"><input type="checkbox" name="active" defaultChecked={b.active} className="accent-kudu-600" /> Active</label>
                <button className="btn-outline py-1.5">Save</button>
              </form>
              <form action={deleteBranch} className="mt-1 flex items-center justify-between text-xs text-charcoal-500">
                <span>{b._count.customers} customer{b._count.customers === 1 ? "" : "s"} · {b._count.users} user{b._count.users === 1 ? "" : "s"}</span>
                <input type="hidden" name="id" value={b.id} />
                <ConfirmButton message={`Delete the ${b.name} branch? Its customers and users are kept but will have no branch.`} className="text-xs text-charcoal-400 hover:text-kudu-600">Delete branch</ConfirmButton>
              </form>
            </div>
          ))}
        </div>
        <form action={saveBranch} className="mt-4 flex flex-wrap items-end gap-2">
          <input name="name" required className="input w-40 flex-none" placeholder="New branch, e.g. Cape Town" aria-label="New branch name" />
          <input name="phone" className="input w-36 flex-none" placeholder="Phone" aria-label="New branch phone" />
          <input name="email" type="email" className="input w-52 flex-none" placeholder="Email" aria-label="New branch email" />
          <textarea name="address" rows={2} className="input min-w-60 flex-1" placeholder="Address" aria-label="New branch address" />
          <button className="btn-primary py-1.5">+ Add branch</button>
        </form>
      </div>

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

      <div id="google-ads" className="card mt-6 space-y-3 p-6">
        <SectionTitle>Google Ads</SectionTitle>
        <p className="text-sm text-charcoal-500">
          Connect this company&apos;s own Google Ads account to pull ad spend, clicks and Google&apos;s conversions per campaign every day.
          The Marketing report then shows cost per lead, cost per won customer and profit after advertising.
        </p>
        {!googleAdsConfigured() ? (
          <p className="text-sm text-kudu-700">
            Google Ads is not set up on the server yet. The platform owner sets <code>GOOGLE_ADS_CLIENT_ID</code> and <code>GOOGLE_ADS_CLIENT_SECRET</code> once (see the README).
          </p>
        ) : (
          <>
            {s.googleAdsRefreshToken ? (
              <p className="text-sm">
                Connected as <strong>{s.googleAdsAccountEmail || "a Google account"}</strong>.{" "}
                {s.googleAdsLastSyncAt ? <>Last synced {fmtDateTime(s.googleAdsLastSyncAt)}.</> : <>Not synced yet.</>}
                {s.googleAdsCurrency && s.googleAdsCurrency !== s.currency && (
                  <span className="mt-1 block text-kudu-700">
                    This Ads account bills in {s.googleAdsCurrency} but Kudu uses {s.currency}. Spend is shown as-is, not converted.
                  </span>
                )}
              </p>
            ) : (
              <p className="text-sm">Not connected. Sign in with a Google account that has access to your Google Ads account.</p>
            )}
            {s.googleAdsLastError && <p className="rounded-md bg-kudu-50 p-2 text-sm text-kudu-800">Last sync problem: {s.googleAdsLastError}</p>}
            <form action={saveGoogleAdsAccount} className="flex flex-wrap items-end gap-2">
              <Field label="Google Ads account number (top right in Google Ads, like 123-456-7890)" className="min-w-72 flex-1">
                <input name="googleAdsCustomerId" className="input" defaultValue={s.googleAdsCustomerId.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1-$2-$3")} placeholder="123-456-7890" inputMode="numeric" />
              </Field>
              <button className="btn-outline">Save account number</button>
            </form>
            <div className="flex flex-wrap gap-2">
              {/* A plain link: this leaves the app for Google's sign-in page. */}
              <a href="/api/google-ads/connect" className={s.googleAdsRefreshToken ? "btn-outline" : "btn-primary"}>
                {s.googleAdsRefreshToken ? "Connect a different Google account" : "Connect Google Ads"}
              </a>
              {s.googleAdsRefreshToken && (
                <>
                  <form action={syncGoogleAdsNow}>
                    <input type="hidden" name="back" value="/settings#google-ads" />
                    <button className="btn-dark">Sync now</button>
                  </form>
                  <form action={disconnectGoogleAds}>
                    <ConfirmButton message="Disconnect Google Ads? Spend already loaded is kept." className="btn-danger">Disconnect</ConfirmButton>
                  </form>
                </>
              )}
            </div>
          </>
        )}
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
