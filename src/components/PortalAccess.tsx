import type { PortalUser } from "@prisma/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { invitePath } from "@/lib/portal";
import { deletePortalUser, invitePortalUser, newPortalLink, setPortalUserDisabled } from "@/app/actions/portalAccess";
import { ConfirmButton } from "@/components/ConfirmButton";
import { InviteLink } from "@/components/InviteLink";
import { SectionTitle } from "@/components/ui";

/** Customer page tab: who at this customer can sign in to the customer portal. */
export function PortalAccessTab({
  customer,
  users,
  companySlug,
  companyName,
}: {
  customer: { id: string; contactPerson: string; email: string };
  users: PortalUser[];
  companySlug: string;
  companyName: string;
}) {
  const now = new Date();
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="card p-6 lg:col-span-2">
        <SectionTitle>Portal logins</SectionTitle>
        <p className="mb-4 text-sm text-charcoal-600">
          People with a login see this customer&apos;s sent quotations (and can accept or decline them), booked visits, completed job cards and service warranties,
          sent invoices with payments, and their queries. They never see drafts, prices on job cards, internal notes or other customers.
          Customers sign in at <span className="font-mono">/portal/login</span>.
        </p>
        {users.length === 0 ? (
          <p className="text-sm text-charcoal-500">Nobody has portal access yet.</p>
        ) : (
          <ul className="divide-y divide-charcoal-100">
            {users.map((u) => {
              const pending = u.inviteToken && u.inviteExpiresAt && u.inviteExpiresAt > now;
              const state = u.disabled ? "Switched off" : !u.passwordHash ? (pending ? "Invited, password not set yet" : "Invite expired") : "Active";
              return (
                <li key={u.id} className="py-4 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold">{u.name || u.email}</div>
                      <div className="text-charcoal-600">{u.email}</div>
                      <div className="text-xs text-charcoal-500">
                        {state}
                        {u.lastLoginAt && ` · last signed in ${fmtDateTime(u.lastLoginAt)}`}
                        {u.createdBy && ` · added by ${u.createdBy}`}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!u.disabled && (
                        <form action={newPortalLink}>
                          <input type="hidden" name="id" value={u.id} />
                          <button className="btn-outline py-1 text-xs">{u.passwordHash ? "Password reset link" : "New invite link"}</button>
                        </form>
                      )}
                      <form action={setPortalUserDisabled}>
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="disabled" value={u.disabled ? "false" : "true"} />
                        <button className="btn-outline py-1 text-xs">{u.disabled ? "Switch on" : "Switch off"}</button>
                      </form>
                      <form action={deletePortalUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <ConfirmButton message={`Remove portal access for ${u.email}?`} className="px-2 py-1 text-xs text-charcoal-400 hover:text-kudu-600">Remove</ConfirmButton>
                      </form>
                    </div>
                  </div>
                  {pending && !u.disabled && (
                    <InviteLink path={invitePath(companySlug, u.inviteToken!)} name={u.name} companyName={companyName} expires={fmtDate(u.inviteExpiresAt)} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <div className="card h-fit p-6">
        <SectionTitle>Give someone access</SectionTitle>
        <form action={invitePortalUser} className="space-y-3">
          <input type="hidden" name="customerId" value={customer.id} />
          <label className="block">
            <span className="label">Name</span>
            <input name="name" className="input" defaultValue={users.length ? "" : customer.contactPerson} />
          </label>
          <label className="block">
            <span className="label">Email (their login)</span>
            <input name="email" type="email" required className="input" defaultValue={users.length ? "" : customer.email} />
          </label>
          <button className="btn-primary w-full">Create login and get link</button>
          <p className="text-xs text-charcoal-500">You&apos;ll get a link to send them by WhatsApp or email. They open it and choose their own password.</p>
        </form>
      </div>
    </div>
  );
}
