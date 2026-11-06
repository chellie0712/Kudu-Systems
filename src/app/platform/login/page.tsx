import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { getPlatformAdmin, signIn } from "@/auth";

export const metadata = { title: "Super-admin sign in" };

export default async function PlatformLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getPlatformAdmin()) redirect("/platform");
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-900 p-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-kudu-600 bg-white p-8 shadow-xl">
        <Image src="/kudu-logo-sm.png" alt="Kudu Systems" width={600} height={389} className="mx-auto mb-2 h-24 w-auto" priority />
        <p className="mb-6 text-center text-sm font-semibold uppercase tracking-wide text-charcoal-500">Super-admin</p>
        {error && <p className="mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">Wrong email or password.</p>}
        <form
          className="space-y-3"
          action={async (fd: FormData) => {
            "use server";
            try {
              await signIn("platform", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/platform" });
            } catch (e) {
              if (e instanceof AuthError) redirect("/platform/login?error=1");
              throw e; // the success redirect
            }
          }}
        >
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
        <p className="mt-6 text-center text-xs text-charcoal-400">
          <Link href="/login" className="hover:text-kudu-600">Company sign-in</Link>
        </p>
      </div>
    </div>
  );
}
