import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { getSettings } from "@/lib/settings";
import { portalSignOut } from "@/app/actions/portal";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PortalNav } from "@/components/PortalNav";

export const metadata = { title: { default: "Customer portal", template: "%s · Customer portal" } };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePortalUser();
  const settings = await getSettings();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print border-b border-charcoal-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 border-b-2 border-kudu-600 px-4 py-2">
          <Link href="/portal"><CompanyLogo logo={settings.logo} name={settings.companyName} className="h-14 w-auto" /></Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-right leading-tight sm:inline">
              <span className="font-semibold">{user.customerName}</span>
              <span className="block text-xs text-charcoal-500">{user.name}</span>
            </span>
            <form action={portalSignOut}><button className="btn-outline py-1.5">Sign out</button></form>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-2 sm:px-4">
          <PortalNav />
        </div>
      </header>
      <main className="print-main mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <footer className="no-print border-t border-charcoal-200 bg-white px-4 py-4 text-center text-xs text-charcoal-500">
        {settings.companyName}
        {settings.phone && <> · <a href={`tel:${settings.phone.replace(/[^\d+]/g, "")}`} className="hover:text-kudu-600">{settings.phone}</a></>}
        {settings.email && <> · <a href={`mailto:${settings.email}`} className="hover:text-kudu-600">{settings.email}</a></>}
      </footer>
    </div>
  );
}
