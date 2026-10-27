import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, authDisabled, signIn } from "@/auth";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (authDisabled || (await auth())?.user) redirect("/");
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-800 p-4">
      <div className="w-full max-w-sm rounded-xl border-t-4 border-kudu-600 bg-white p-8 shadow-xl">
        <Image src="/kudu-logo-sm.png" alt="Kudu Systems" width={600} height={389} className="mx-auto mb-6 h-28 w-auto" priority />
        {error && (
          <p className="mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">
            {error === "AccessDenied"
              ? "This Google account is not allowed to use Kudu. Ask an administrator to add it."
              : "Sign-in failed. Please try again."}
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn-primary w-full py-2.5">Sign in with Google</button>
        </form>
        <p className="mt-4 text-center text-xs text-charcoal-500">Signing in also lets Kudu sync your Google Calendar.</p>
      </div>
    </div>
  );
}
