import Link from "next/link";
import { Nav } from "@/components/Nav";
import { authDisabled, requireUser, signOut } from "@/auth";
import { CompanyLogo } from "@/components/CompanyLogo";
import { getSettings } from "@/lib/settings";
import { ROLE_LABELS, can } from "@/lib/permissions";
import { currentBranchId, getBranches } from "@/lib/branch";
import { BranchSwitcher } from "@/components/BranchSwitcher";
import { SignOutButton } from "@/components/SignOutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const settings = await getSettings();
  const staff = can(user.role, "customers.view");
  const [branches, branchId] = staff ? await Promise.all([getBranches(), currentBranchId()]) : [[], null];
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print flex h-20 items-center justify-between border-b-2 border-kudu-600 bg-white px-4 md:px-6">
        <Link href="/" className="flex items-center">
          <CompanyLogo logo={settings.logo} name={settings.companyName} className="h-16 w-auto" />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {branches.length > 0 && <BranchSwitcher branches={branches.map((b) => ({ id: b.id, name: b.name }))} current={branchId} />}
          {authDisabled && (
            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Local demo mode</span>
          )}
          <Link href="/account" title="My profile" className="hidden text-right leading-tight text-charcoal-600 hover:text-kudu-700 sm:inline">
            {user.name}
            <span className="block text-xs text-charcoal-400">{settings.companyName} · {ROLE_LABELS[user.role]}</span>
          </Link>
          {!authDisabled && (
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <SignOutButton />
            </form>
          )}
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="no-print bg-charcoal-800 md:w-56 md:shrink-0">
          <Nav role={user.role} />
        </aside>
        <main className="print-main min-w-0 flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
