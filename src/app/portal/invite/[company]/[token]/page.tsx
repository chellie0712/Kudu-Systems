import Link from "next/link";
import { acceptPortalInvite } from "@/app/actions/portal";
import { PortalBrand } from "@/components/Portal";
import { portalCompany } from "@/lib/portalCompany";
import { clientForCompany } from "@/lib/tenant";
import { MIN_PASSWORD } from "@/lib/portal";

export const metadata = { title: "Set your password" };

/** Where the link the office sends lands: the customer chooses their password and is signed in. */
export default async function PortalInvitePage({ params, searchParams }: { params: Promise<{ company: string; token: string }>; searchParams: Promise<{ err?: string }> }) {
  const { company: slugParam, token } = await params;
  const { err } = await searchParams;
  const { slug, company, settings } = await portalCompany(slugParam);
  const invite = company
    ? await clientForCompany(company).portalUser.findUnique({ where: { inviteToken: token }, include: { customer: { select: { name: true } } } })
    : null;
  const valid = invite && !invite.disabled && invite.inviteExpiresAt && invite.inviteExpiresAt > new Date();

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-800 p-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-kudu-600 bg-white p-8 shadow-xl">
        <PortalBrand settings={settings} />
        {!valid ? (
          <div className="space-y-3 text-center text-sm">
            <p className="font-semibold">This link has expired or has already been used.</p>
            <p className="text-charcoal-600">Ask {settings?.companyName || "us"} to send you a new link, or sign in if you have already set your password.</p>
            <Link href={`/portal/login?company=${slug}`} className="btn-primary inline-block">Go to sign in</Link>
          </div>
        ) : (
          <>
            <h1 className="mb-1 text-center text-lg font-bold">Welcome{invite.name ? `, ${invite.name.split(" ")[0]}` : ""}</h1>
            <p className="mb-5 text-center text-sm text-charcoal-500">
              Choose a password for the {settings?.companyName} customer portal for {invite.customer.name}.
            </p>
            {err && <p className="mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">{err}</p>}
            <form action={acceptPortalInvite} className="space-y-3">
              <input type="hidden" name="company" value={slug} />
              <input type="hidden" name="token" value={token} />
              <label className="block">
                <span className="label">Email</span>
                <input value={invite.email} readOnly autoComplete="username" className="input bg-charcoal-50" />
              </label>
              <label className="block">
                <span className="label">New password (at least {MIN_PASSWORD} characters)</span>
                <input name="password" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
              </label>
              <label className="block">
                <span className="label">Type it again</span>
                <input name="confirm" type="password" required minLength={MIN_PASSWORD} autoComplete="new-password" className="input" />
              </label>
              <button className="btn-primary w-full py-2.5">Set password and sign in</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
