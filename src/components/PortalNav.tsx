"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portal", label: "Overview" },
  { href: "/portal/services", label: "Services" },
  { href: "/portal/quotations", label: "Quotations" },
  { href: "/portal/invoices", label: "Invoices" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/queries", label: "Queries" },
];

export function PortalNav() {
  const path = usePathname();
  return (
    <nav className="no-print flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === "/portal" ? path === "/portal" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium ${active ? "border-kudu-600 text-kudu-700" : "border-transparent text-charcoal-500 hover:text-charcoal-800"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
