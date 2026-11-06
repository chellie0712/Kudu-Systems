import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/auth";
import { addCompanyUser, resetCompanyUserPassword, setCompanyActive, setCompanyUserDisabled, updateCompany } from "@/app/actions/platform";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { databaseLabel, MAIN_COMPANY_ID, platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";

export default async function CompanyAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const company = await platformDb.company.findUnique({ where: { id } });
  if (!company) notFound();

  // Only the company's user list is read from its database; its customers and documents are not.
  let users: { id: string; name: string | null; email: string | null; disabled: boolean; passwordHash: string | null }[] = [];
  let dbError = "";
  try {
    users = await clientForCompany(company).user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, disabled: true, passwordHash: true },
    });
  } catch (e) {
    dbError = e instanceof Error ? e.message.split("\n").slice(-1)[0] : "unknown error";
  }

  return (
    <div>
      <PageHeader title={company.name} subtitle={databaseLabel(company)} back={{ href: "/platform", label: "Companies" }} />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {dbError && <Flash message={`Could not reach this company's database: ${dbError}`} tone="error" />}

      <form action={updateCompany} className="card space-y-4 p-6">
        <SectionTitle>Company</SectionTitle>
        <input type="hidden" name="id" value={company.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name (in this list only; documents use the name in the company's Settings)"><input name="name" className="input" defaultValue={company.name} required /></Field>
          <Field label="Company code (changing it changes what users type at sign-in)">
            <input name="slug" className="input font-mono" defaultValue={company.slug} required pattern="[a-zA-Z0-9-]{2,30}" />
          </Field>
        </div>
        <p className="text-sm text-charcoal-600">
          Sign-in link for this company: <code className="rounded bg-charcoal-50 px-1">/login?company={company.slug}</code>
        </p>
        <button className="btn-primary">Save</button>
      </form>

      <div className="card mt-6 space-y-3 p-6">
        <SectionTitle>Access</SectionTitle>
        <p className="text-sm">
          Access is <strong>{company.active ? "on" : "off"}</strong>.{" "}
          {company.active ? "Switching it off stops all of this company's users from signing in. Its data is kept." : "Its users cannot sign in."}
        </p>
        <form action={setCompanyActive}>
          <input type="hidden" name="id" value={company.id} />
          <input type="hidden" name="active" value={String(!company.active)} />
          {company.active ? (
            <ConfirmButton
              message={company.id === MAIN_COMPANY_ID ? "This is the original Kudu company. Switch off access for all of its users?" : `Switch off access for all users of ${company.name}?`}
              className="btn-danger"
            >
              Switch access off
            </ConfirmButton>
          ) : (
            <button className="btn-primary">Switch access on</button>
          )}
        </form>
      </div>

      <div id="users" className="card mt-6 p-6">
        <SectionTitle>Users of {company.name}</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">Company users can also manage each other in their own Settings → Users.</p>
        <div className="divide-y divide-charcoal-100">
          {users.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-charcoal-500">{u.email}{u.disabled && " · disabled"}{!u.passwordHash && " · Google only"}</div>
              </div>
              <form action={resetCompanyUserPassword} className="flex gap-2">
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="userId" value={u.id} />
                <input name="password" type="password" minLength={10} className="input w-44 py-1.5" placeholder="New password" autoComplete="new-password" required />
                <button className="btn-outline py-1.5">Set password</button>
              </form>
              <form action={setCompanyUserDisabled}>
                <input type="hidden" name="companyId" value={company.id} />
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="disabled" value={String(!u.disabled)} />
                <button className={u.disabled ? "btn-outline py-1.5" : "btn-danger py-1.5"}>{u.disabled ? "Enable" : "Disable"}</button>
              </form>
            </div>
          ))}
          {users.length === 0 && !dbError && <p className="py-2 text-sm text-charcoal-500">No users yet.</p>}
        </div>
        <form action={addCompanyUser} className="mt-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="companyId" value={company.id} />
          <input name="name" className="input w-44 flex-none" placeholder="Name" />
          <input name="email" type="email" className="input w-56 flex-none" placeholder="Email" required />
          <input name="password" type="password" minLength={10} className="input w-44 flex-none" placeholder="Password" autoComplete="new-password" required />
          <button className="btn-primary py-1.5">+ Add user</button>
        </form>
      </div>
    </div>
  );
}
