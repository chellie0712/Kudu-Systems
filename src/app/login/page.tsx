import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { getUser, googleSignInEnabled, signIn } from "@/auth";

export const metadata = { title: "Sign in" };

const errors: Record<string, string> = {
  CredentialsSignin: "Wrong email or password.",
  AccessDenied: "This account is not allowed to use Kudu. Ask an administrator.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getUser()) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-800 p-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-kudu-600 bg-white p-8 shadow-xl">
        <Image src="/kudu-logo-sm.png" alt="Kudu Systems" width={600} height={389} className="mx-auto mb-6 h-28 w-auto" priority />
        {error && <p className="mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">{errors[error] ?? "Sign-in failed. Please try again."}</p>}
        <form
          className="space-y-3"
          action={async (fd: FormData) => {
            "use server";
            try {
              await signIn("credentials", { email: fd.get("email"), password: fd.get("password"), redirectTo: "/" });
            } catch (e) {
              if (e instanceof AuthError) redirect(`/login?error=${e.type}`);
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
        {googleSignInEnabled && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-charcoal-400">
              <span className="h-px flex-1 bg-charcoal-100" /> or <span className="h-px flex-1 bg-charcoal-100" />
            </div>
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/" });
              }}
            >
              <button className="btn-outline w-full py-2.5">Sign in with Google</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
