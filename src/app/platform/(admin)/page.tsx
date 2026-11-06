import Link from "next/link";
import { requirePlatformAdmin } from "@/auth";
import { addPlatformAdmin, createCompany, setPlatformAdminDisabled, setPlatformAdminPassword } from "@/app/actions/platform";
import { LogoInput } from "@/components/LogoInput";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { databaseLabel, platformDb } from "@/lib/platform";

// Creating a company creates and migrates a database, which takes a few seconds.
export const maxDuration = 60;

export default async function PlatformPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const me = await requirePlatformAdmin();
  const { msg, err } = await searchParams;
  const [companies, admins] = await Promise.all([
    platformDb.company.findMany({ orderBy: { createdAt: "asc" } }),
    platformDb.platformAdmin.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader title="Companies" subtitle="Each company has its own database, logo, settings, users, customers and documents." />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-charcoal-50 text-left text-xs uppercase tracking-wide text-charcoal-500">
            <tr><th className="px-4 py-2">Company</th><th className="px-4 py-2">Company code</th><th className="px-4 py-2">Data</th><th className="px-4 py-2">Access</th></tr>
          </thead>
          <tbody className="divide-y divide-charcoal-100">
            {companies.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2"><Link href={`/platform/companies/${c.id}`} className="font-medium text-kudu-700 hover:underline">{c.name}</Link></td>
                <td className="px-4 py-2 font-mono">{c.slug}</td>
                <td className="px-4 py-2 text-charcoal-600">{databaseLabel(c)}</td>
                <td className="px-4 py-2">{c.active ? <span className="text-green-700">On</span> : <span className="text-kudu-700">Off</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={createCompany} className="card mt-6 space-y-6 p-6">
        <SectionTitle>New company</SectionTitle>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Company name"><input name="name" className="input" required /></Field>
          <Field label="Company code (typed at sign-in; letters, digits, dashes)">
            <input name="slug" className="input font-mono" required pattern="[a-zA-Z0-9-]{2,30}" placeholder="e.g. acme-pest" />
          </Field>
          <div className="md:col-span-2">
            <span className="label">Logo (optional; the company can change it later in Settings)</span>
            <LogoInput />
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-charcoal-700">First admin</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Name"><input name="adminName" className="input" /></Field>
            <Field label="Email"><input name="adminEmail" type="email" className="input" required /></Field>
            <Field label="Password (at least 10 characters)"><input name="adminPassword" type="password" minLength={10} className="input" autoComplete="new-password" required /></Field>
          </div>
        </div>
        <fieldset>
          <h3 className="mb-2 text-sm font-semibold text-charcoal-700">Database</h3>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="dbMode" value="auto" defaultChecked className="mt-1 accent-kudu-600" />
            <span>Create a new database for this company on the Kudu Neon server <span className="text-charcoal-500">(recommended; no extra setup)</span></span>
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" name="dbMode" value="url" className="mt-1 accent-kudu-600" />
            <span>Use an empty database I created elsewhere, e.g. a separate Neon project. Paste its <strong>direct</strong> (not pooled) connection string:</span>
          </label>
          <input name="dbUrl" className="input mt-2 font-mono text-xs" placeholder="postgresql://user:password@host/dbname?sslmode=require" autoComplete="off" />
          <p className="mt-1 text-xs text-charcoal-500">The connection string is stored encrypted.</p>
        </fieldset>
        <button className="btn-primary">Create company</button>
      </form>

      <div id="admins" className="card mt-6 p-6">
        <SectionTitle>Super-admins</SectionTitle>
        <p className="mb-3 text-sm text-charcoal-500">Super-admins create and manage companies. They cannot see a company&apos;s customers or documents.</p>
        <div className="divide-y divide-charcoal-100">
          {admins.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{a.name || a.email} {a.id === me.id && <span className="text-xs text-charcoal-500">(you)</span>}</div>
                <div className="text-xs text-charcoal-500">{a.email}{a.disabled && " · disabled"}</div>
              </div>
              <form action={setPlatformAdminPassword} className="flex gap-2">
                <input type="hidden" name="id" value={a.id} />
                <input name="password" type="password" minLength={10} className="input w-44 py-1.5" placeholder="New password" autoComplete="new-password" required />
                <button className="btn-outline py-1.5">Set password</button>
              </form>
              {a.id !== me.id && (
                <form action={setPlatformAdminDisabled}>
                  <input type="hidden" name="id" value={a.id} />
                  <input type="hidden" name="disabled" value={String(!a.disabled)} />
                  <button className={a.disabled ? "btn-outline py-1.5" : "btn-danger py-1.5"}>{a.disabled ? "Enable" : "Disable"}</button>
                </form>
              )}
            </div>
          ))}
        </div>
        <form action={addPlatformAdmin} className="mt-4 flex flex-wrap items-end gap-2">
          <input name="name" className="input w-44 flex-none" placeholder="Name" />
          <input name="email" type="email" className="input w-56 flex-none" placeholder="Email" required />
          <input name="password" type="password" minLength={10} className="input w-44 flex-none" placeholder="Password" autoComplete="new-password" required />
          <button className="btn-primary py-1.5">+ Add super-admin</button>
        </form>
      </div>
    </div>
  );
}
