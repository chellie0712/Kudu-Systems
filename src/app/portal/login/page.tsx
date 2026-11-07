import { redirect } from "next/navigation";
import { getPortalUser } from "@/auth";
import { portalSignIn } from "@/app/actions/portal";
import { PortalBrand } from "@/components/Portal";
import { portalCompany } from "@/lib/portalCompany";

export const metadata = { title: "Customer portal" };

export default async function PortalLoginPage({ searchParams }: { searchParams: Promise<{ error?: string; company?: string }> }) {
  if (await getPortalUser()) redirect("/portal");
  const { error, company } = await searchParams;
  const { slug, settings } = await portalCompany(company);
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-800 p-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-kudu-600 bg-white p-8 shadow-xl">
        <PortalBrand settings={settings} />
        <h1 className="mb-1 text-center text-lg font-bold">Customer portal</h1>
        <p className="mb-5 text-center text-sm text-charcoal-500">Your quotes, service certificates and invoices in one place.</p>
        {error && <p className="mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">Wrong email or password. If you have forgotten your password, ask us for a new link.</p>}
        <form action={portalSignIn} className="space-y-3">
          {/* The company code comes from the link; it is only asked for when it is not known. */}
          {slug ? (
            <input type="hidden" name="company" value={slug} />
          ) : (
            <label className="block">
              <span className="label">Company code</span>
              <input name="company" required className="input" autoCapitalize="none" spellCheck={false} />
            </label>
          )}
          <label className="block">
            <span className="label">Email</span>
            <input name="email" type="email" required autoComplete="username" className="input" />
          </label>
          <label className="block">
            <span className="label">Password</span>
            <input name="password" type="password" required autoComplete="current-password" className="input" />
          </label>
          <button className="btn-primary w-full py-2.5">Sign in</button>
        </form>
        {settings && (settings.phone || settings.email) && (
          <p className="mt-6 text-center text-xs text-charcoal-500">
            No login yet? Contact {settings.companyName}
            {settings.phone && <> on <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="text-kudu-600">{settings.phone}</a></>}
            {settings.email && <> or <a href={`mailto:${settings.email}`} className="text-kudu-600">{settings.email}</a></>}.
          </p>
        )}
      </div>
    </div>
  );
}
