import Image from "next/image";
import Link from "next/link";
import { requirePlatformAdmin, signOut } from "@/auth";

export const metadata = { title: { default: "Companies", template: "%s · Kudu super-admin" } };

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const admin = await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-charcoal-50">
      <header className="flex h-20 items-center justify-between border-b-2 border-kudu-600 bg-charcoal-800 px-4 text-white md:px-6">
        <Link href="/platform" className="flex items-center gap-3">
          <span className="rounded bg-white p-1"><Image src="/kudu-logo-sm.png" alt="Kudu Systems" width={600} height={389} className="h-12 w-auto" priority /></span>
          <span className="text-sm font-semibold uppercase tracking-wide text-charcoal-200">Super-admin</span>
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-charcoal-200 sm:inline">{admin.name}</span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/platform/login" });
            }}
          >
            <button className="rounded-md border border-charcoal-500 px-3 py-1.5 hover:bg-charcoal-700">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl p-4 md:p-8">{children}</main>
    </div>
  );
}
