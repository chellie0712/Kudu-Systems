import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { customerBranchWhere } from "@/lib/branch";
import { assignees } from "@/lib/assignees";
import { createTask } from "@/app/actions/tasks";
import { Flash, PageHeader } from "@/components/ui";
import { TaskFields } from "@/components/Tasks";

export const metadata = { title: "New task" };

type Params = { customerId?: string; jobCardId?: string; quotationId?: string; invoiceId?: string; queryId?: string; returnTo?: string; err?: string };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requirePermission("tasks.edit");
  const db = await tenantDb();
  const sp = await searchParams;
  const [customer, jobCard, quotation, invoice, query] = await Promise.all([
    sp.customerId ? db.customer.findUnique({ where: { id: sp.customerId }, select: { id: true, name: true } }) : null,
    sp.jobCardId ? db.jobCard.findUnique({ where: { id: sp.jobCardId }, select: { id: true, number: true, customer: { select: { name: true } } } }) : null,
    sp.quotationId ? db.quotation.findUnique({ where: { id: sp.quotationId }, select: { id: true, number: true, customer: { select: { name: true } } } }) : null,
    sp.invoiceId ? db.invoice.findUnique({ where: { id: sp.invoiceId }, select: { id: true, number: true, customer: { select: { name: true } } } }) : null,
    sp.queryId ? db.query.findUnique({ where: { id: sp.queryId }, select: { id: true, number: true, customer: { select: { name: true } } } }) : null,
  ]);
  const doc = jobCard ?? quotation ?? invoice ?? query;
  const about = [doc && `${doc.number} · ${doc.customer.name}`, !doc && customer?.name].filter(Boolean).join("");
  const pickCustomer = !customer && !doc && can(user, "customers.view");
  const canAssign = can(user, "tasks.assign");
  const [people, rules, customers] = await Promise.all([
    canAssign ? assignees(db) : Promise.resolve([]),
    db.assignmentRule.count({ where: { active: true } }),
    pickCustomer ? db.customer.findMany({ where: { archived: false, ...(await customerBranchWhere()) }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);
  const returnTo = sp.returnTo && sp.returnTo.startsWith("/") && !sp.returnTo.startsWith("//") ? sp.returnTo : "";

  return (
    <div className="max-w-3xl">
      <PageHeader title="New task" subtitle={about ? `About ${about}` : undefined} back={returnTo ? { href: returnTo, label: "Back" } : { href: "/tasks", label: "Tasks" }} />
      <Flash message={sp.err} tone="error" />
      <form action={createTask} className="card space-y-4 p-6">
        {customer && <input type="hidden" name="customerId" value={customer.id} />}
        {jobCard && <input type="hidden" name="jobCardId" value={jobCard.id} />}
        {quotation && <input type="hidden" name="quotationId" value={quotation.id} />}
        {invoice && <input type="hidden" name="invoiceId" value={invoice.id} />}
        {query && <input type="hidden" name="queryId" value={query.id} />}
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <TaskFields people={people} canAssign={canAssign} hasRules={rules > 0} meId={user.id} />
        {pickCustomer && (
          <label className="block">
            <span className="label">Customer (optional)</span>
            <select name="customerId" defaultValue="" className="input">
              <option value="">None</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        )}
        <button className="btn-primary">Add task</button>
      </form>
    </div>
  );
}
