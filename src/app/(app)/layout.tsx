import Image from "next/image";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { authDisabled, requireUser, signOut } from "@/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print flex h-20 items-center justify-between border-b-2 border-kudu-600 bg-white px-4 md:px-6">
        <Link href="/" className="flex items-center">
          <Image src="/kudu-logo-sm.png" alt="Kudu Systems – CRM & BPA Online System" width={600} height={389} className="h-16 w-auto" priority />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {authDisabled && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Local demo mode</span>
          )}
          <span className="hidden text-charcoal-600 sm:inline">{user.name}</span>
          {!authDisabled && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button className="btn-outline py-1.5">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="no-print bg-charcoal-800 md:w-56 md:shrink-0">
          <Nav />
        </aside>
        <main className="print-main min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
