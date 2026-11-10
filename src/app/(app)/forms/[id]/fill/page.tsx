import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can, canAccessJobCard } from "@/lib/permissions";
import { customerBranchWhere } from "@/lib/branch";
import { parseFields } from "@/lib/forms";
import { submitForm } from "@/app/actions/forms";
import { PageHeader } from "@/components/ui";
import { FormRenderer } from "@/components/FormRenderer";

export const metadata = { title: "Fill in form" };

export default async function FillFormPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ customerId?: string; jobCardId?: string }> }) {
  const user = await requirePermission("forms.fill");
  const db = await tenantDb();
  const { id } = await params;
  const sp = await searchParams;
  const form = await db.form.findFirst({ where: { id, active: true, internal: true } });
  if (!form) notFound();
  const jobCard = sp.jobCardId ? await db.jobCard.findUnique({ where: { id: sp.jobCardId }, select: { id: true, number: true, technicianId: true, customerId: true, customer: { select: { name: true } } } }) : null;
  if (jobCard && !canAccessJobCard(user, jobCard)) redirect("/no-access?need=jobcards.viewAll");
  const customer = !jobCard && sp.customerId && can(user, "customers.view") ? await db.customer.findUnique({ where: { id: sp.customerId }, select: { id: true, name: true } }) : null;
  if (form.linkTo === "jobCard" && !jobCard) redirect("/forms?err=Open+this+form+from+a+job+card.");
  // A customer form opened from Forms: pick the customer first.
  const customers =
    form.linkTo === "customer" && !customer && !jobCard && can(user, "customers.view")
      ? await db.customer.findMany({ where: { archived: false, ...(await customerBranchWhere()) }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
  const back = jobCard ? { href: `/job-cards/${jobCard.id}`, label: jobCard.number } : customer ? { href: `/customers/${customer.id}?tab=forms`, label: customer.name } : { href: "/forms", label: "Forms" };

  return (
    <div className="max-w-2xl">
      <PageHeader
        back={back}
        title={form.name}
        subtitle={jobCard ? `${jobCard.number} · ${jobCard.customer.name}` : customer?.name ?? form.description}
      />
      {customers.length > 0 ? (
        <form className="card space-y-3 p-6">
          <label className="block">
            <span className="label">Which customer is it for?</span>
            <select name="customerId" required className="input" defaultValue="">
              <option value="" disabled>Choose…</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <button className="btn-primary">Continue</button>
        </form>
      ) : (
        <div className="card p-6">
          {(jobCard || customer) && form.description && <p className="mb-4 text-sm text-charcoal-600">{form.description}</p>}
          <FormRenderer
            fields={parseFields(form.fields)}
            action={submitForm}
            hidden={{ formId: form.id, customerId: customer?.id ?? "", jobCardId: jobCard?.id ?? "" }}
            submitLabel="Save"
          />
        </div>
      )}
    </div>
  );
}
