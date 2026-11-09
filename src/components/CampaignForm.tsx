import type { EmailCampaign } from "@prisma/client";
import { saveCampaign } from "@/app/actions/email";
import { LEAD_SOURCES } from "@/lib/marketing";
import { MERGE_FIELDS } from "@/lib/email/render";
import { Field, SectionTitle } from "./ui";

export function CampaignForm({ campaign, branches }: { campaign?: EmailCampaign; branches: { id: string; name: string }[] }) {
  const c = campaign;
  return (
    <form action={saveCampaign} className="card space-y-6 p-6">
      {c && <input type="hidden" name="id" value={c.id} />}
      <section className="space-y-4">
        <SectionTitle>Email</SectionTitle>
        <Field label="Campaign name (only you see this)">
          <input name="name" required className="input" defaultValue={c?.name} placeholder="e.g. Winter termite special 2026" maxLength={150} />
        </Field>
        <Field label="Subject">
          <input name="subject" required className="input" defaultValue={c?.subject} placeholder="e.g. {{first_name}}, 15% off your next fumigation" maxLength={200} />
        </Field>
        <Field label="Preview line (shown after the subject in the inbox)">
          <input name="preheader" className="input" defaultValue={c?.preheader} placeholder="Book before 30 June" maxLength={200} />
        </Field>
        <Field label="Message">
          <textarea name="body" required rows={14} className="input font-mono text-[13px]" defaultValue={c?.body ?? "Hi {{first_name}},\n\n\n\nKind regards,\n{{sender_name}}\n{{company_name}}"} />
        </Field>
        <div className="grid gap-2 rounded-md bg-charcoal-50 p-3 text-xs text-charcoal-600 sm:grid-cols-2">
          <div>
            <div className="mb-1 font-semibold text-charcoal-700">Formatting</div>
            Blank line = new paragraph · <code># Heading</code> · <code>- bullet</code> · <code>**bold**</code> · <code>[link text](https://…)</code>
          </div>
          <div>
            <div className="mb-1 font-semibold text-charcoal-700">Filled in for each customer</div>
            {MERGE_FIELDS.map((m) => <div key={m.tag}><code>{m.tag}</code> {m.help}</div>)}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Button text (optional)">
            <input name="buttonLabel" className="input" defaultValue={c?.buttonLabel} placeholder="Book now" maxLength={60} />
          </Field>
          <Field label="Button link">
            <input name="buttonUrl" type="url" className="input" defaultValue={c?.buttonUrl} placeholder="https://…" />
          </Field>
        </div>
        <p className="text-xs text-charcoal-500">Your company name, address, contact details and an unsubscribe link are added at the bottom of every email automatically.</p>
      </section>
      <section className="space-y-4">
        <SectionTitle>Who gets it</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          {branches.length > 0 && (
            <Field label="Branch">
              <select name="audBranchId" className="input" defaultValue={c?.audBranchId ?? ""}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Customer type">
            <select name="audType" className="input" defaultValue={c?.audType ?? ""}>
              <option value="">Businesses and households</option>
              <option value="BUSINESS">Businesses only</option>
              <option value="INDIVIDUAL">Households only</option>
            </select>
          </Field>
          <Field label="Lead source">
            <select name="audLeadSource" className="input" defaultValue={c?.audLeadSource ?? ""}>
              <option value="">Any</option>
              {LEAD_SOURCES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Field>
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="audOptedInOnly" defaultChecked={c?.audOptedInOnly} className="mt-1" />
          <span>Only customers who opted in <span className="block text-xs text-charcoal-500">Leave unticked to also include existing customers (anyone with an issued invoice) who have not unsubscribed.</span></span>
        </label>
      </section>
      <button className="btn-primary">Save draft</button>
    </form>
  );
}
