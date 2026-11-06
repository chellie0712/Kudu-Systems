import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { COMPANY_COOKIE, getUser, googleSignInEnabled, signIn } from "@/auth";
import { normaliseSlug, platformDb } from "@/lib/platform";

export const metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  CredentialsSignin: "Wrong company code, email or password.",
  AccessDenied: "This account is not allowed to use this company. Ask your administrator.",
  CompanyDisabled: "This company's access has been switched off. Contact Kudu Systems.",
};

async function rememberCompany(raw: FormDataEntryValue | null) {
  const slug = normaliseSlug(String(raw ?? ""));
  (await cookies()).set(COMPANY_COOKIE, slug, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 24 * 60 * 60, path: "/" });
  return slug;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; company?: string }> }) {
  if (await getUser()) redirect("/");
  const { error, company } = await searchParams;
  // Prefill the company code from the link (?company=acme), the last sign-in, or the only company there is.
  let companyCode = normaliseSlug(company ?? "") || (await cookies()).get(COMPANY_COOKIE)?.value || "";
  if (!companyCode) {
    const active = await platformDb.company.findMany({ where: { active: true }, select: { slug: true }, take: 2 });
    if (active.length === 1) companyCode = active[0].slug;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-800 p-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-kudu-600 bg-white p-8 shadow-xl">
        <Image src="/kudu-logo-sm.png" alt="Kudu Systems" width={600} height={389} className="mx-auto mb-6 h-28 w-auto" priority />
        {error && <p className="mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">{errors[error] ?? "Sign-in failed. Please try again."}</p>}
        <form
          className="space-y-3"
          action={async (fd: FormData) => {
            "use server";
            const slug = await rememberCompany(fd.get("company"));
            try {
              await signIn("credentials", { company: slug, email: fd.get("email"), password: fd.get("password"), redirectTo: "/" });
            } catch (e) {
              if (e instanceof AuthError) redirect(`/login?error=${e.type}`);
              throw e; // the success redirect
            }
          }}
        >
          <label className="block">
            <span className="label">Company code</span>
            <input name="company" required autoComplete="organization" className="input" defaultValue={companyCode} autoCapitalize="none" spellCheck={false} />
          </label>
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
        {googleSignInEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-charcoal-400">
              <span className="h-px flex-1 bg-charcoal-100" /> or <span className="h-px flex-1 bg-charcoal-100" />
            </div>
            <form
              className="space-y-2"
              action={async (fd: FormData) => {
                "use server";
                await rememberCompany(fd.get("company"));
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <input name="company" required className="input" placeholder="Company code" defaultValue={companyCode} aria-label="Company code" />
              <button className="btn-outline w-full py-2.5">Sign in with Google</button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-xs text-charcoal-400">
          <Link href="/platform/login" className="hover:text-kudu-600">Super-admin sign-in</Link>
        </p>
      </div>
    </div>
  );
}
