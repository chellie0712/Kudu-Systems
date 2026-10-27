"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { href: "/customers", label: "Customers", icon: "M17 20h5v-2a4 4 0 00-5-3.87M9 20H2v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z" },
  { href: "/quotations", label: "Quotations", icon: "M9 12h6m-6 4h6M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" },
  { href: "/job-cards", label: "Job Cards", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { href: "/invoices", label: "Invoices", icon: "M9 14l2 2 4-4M4 4h16v16l-3-2-3 2-2-2-2 2-3-2-3 2z" },
  { href: "/calendar", label: "Calendar", icon: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { href: "/settings", label: "Settings", icon: "M10.3 4.3a1.7 1.7 0 013.4 0 1.7 1.7 0 002.6 1.1 1.7 1.7 0 012.4 2.4 1.7 1.7 0 001 2.5 1.7 1.7 0 010 3.4 1.7 1.7 0 00-1 2.6 1.7 1.7 0 01-2.4 2.4 1.7 1.7 0 00-2.6 1 1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1 1.7 1.7 0 01-2.4-2.4 1.7 1.7 0 00-1.1-2.6 1.7 1.7 0 010-3.4 1.7 1.7 0 001.1-2.5 1.7 1.7 0 012.4-2.4 1.7 1.7 0 002.5-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-visible md:px-3 md:py-4">
      {items.map((item) => {
        const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-3 rounded-md border-l-4 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-kudu-600 bg-charcoal-700 text-white"
                : "border-transparent text-charcoal-200 hover:bg-charcoal-700/60 hover:text-white"
            }`}
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
