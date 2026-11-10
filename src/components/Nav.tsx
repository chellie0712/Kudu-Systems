"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { can, type Access, type Permission } from "@/lib/permissions";

const items: { href: string; label: string; icon: string; permission?: Permission; anyOf?: Permission[]; hideWith?: Permission }[] = [
  { href: "/", label: "Dashboard", icon: "M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" },
  { permission: "customers.view", href: "/customers", label: "Customers", icon: "M17 20h5v-2a4 4 0 00-5-3.87M9 20H2v-2a4 4 0 015-3.87m6-4.13a4 4 0 11-8 0 4 4 0 018 0zm6 2a3 3 0 11-6 0 3 3 0 016 0z" },
  { permission: "quotations.view", href: "/quotations", label: "Quotations", icon: "M9 12h6m-6 4h6M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" },
  { href: "/job-cards", label: "Job Cards", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" },
  { permission: "invoices.view", href: "/invoices", label: "Invoices", icon: "M9 14l2 2 4-4M4 4h16v16l-3-2-3 2-2-2-2 2-3-2-3 2z" },
  { permission: "queries.view", href: "/queries", label: "Queries", icon: "M8 10h8M8 14h5M21 12c0 4.4-4 8-9 8a9.9 9.9 0 01-4-.8L3 20l1.3-3.9A7.5 7.5 0 013 12c0-4.4 4-8 9-8s9 3.6 9 8z" },
  { permission: "tasks.view", href: "/tasks", label: "Tasks", icon: "M9 11l3 3 8-8M20 12v7a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1h11" },
  {
    anyOf: ["invoices.approve", "quotations.approve", "purchases.approve", "expenses.approve", "leave.approve"],
    href: "/approvals",
    label: "Approvals",
    icon: "M9 12l2 2 4-4m5.6-4.2A12 12 0 0112 3a12 12 0 01-8.6 2.8A12 12 0 003 9c0 5.6 3.8 10.3 9 11.6 5.2-1.3 9-6 9-11.6 0-1.1-.1-2.1-.4-3.2z",
  },
  { permission: "forms.fill", href: "/forms", label: "Forms", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4" },
  { permission: "workflows.manage", href: "/workflows", label: "Workflows", icon: "M4 6h6v4H4zM14 14h6v4h-6zM7 10v4a2 2 0 002 2h5M17 14V8a2 2 0 00-2-2h-5" },
  { permission: "reports.view", href: "/reports", label: "Reports", icon: "M4 20h16M7 16V10m5 6V5m5 11v-4" },
  { permission: "reports.view", href: "/monitor", label: "Process monitor", icon: "M3 12h4l3-8 4 16 3-8h4" },
  { permission: "reports.view", href: "/marketing", label: "Marketing", icon: "M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zm13-3a5 5 0 010 8m3-11a9 9 0 010 14" },
  { permission: "campaigns.edit", href: "/marketing/email", label: "Email campaigns", icon: "M3 7l9 6 9-6M5 5h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2z" },
  { permission: "expenses.manage", href: "/expenses", label: "Expenses", icon: "M12 8c-2 0-3 .9-3 2s1 1.7 3 2 3 .9 3 2-1 2-3 2m0-8c1.1 0 2.1.4 2.6 1M12 8V6m0 10v2m0-2c-1.1 0-2.1-.4-2.6-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
  { permission: "inventory.view", href: "/inventory", label: "Inventory", icon: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" },
  { permission: "purchases.view", href: "/purchase-orders", label: "Purchase orders", icon: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" },
  { permission: "stock.use", hideWith: "inventory.view", href: "/inventory/van", label: "My van", icon: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 19a2 2 0 100-4 2 2 0 000 4zm10 0a2 2 0 100-4 2 2 0 000 4z" },
  { permission: "expenses.claim", href: "/claims", label: "Expense claims", icon: "M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" },
  { permission: "leave.request", href: "/leave", label: "Leave", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" },
  { href: "/calendar", label: "Calendar", icon: "M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" },
  { permission: "settings.manage", href: "/settings", label: "Settings", icon: "M10.3 4.3a1.7 1.7 0 013.4 0 1.7 1.7 0 002.6 1.1 1.7 1.7 0 012.4 2.4 1.7 1.7 0 001 2.5 1.7 1.7 0 010 3.4 1.7 1.7 0 00-1 2.6 1.7 1.7 0 01-2.4 2.4 1.7 1.7 0 00-2.6 1 1.7 1.7 0 01-3.4 0 1.7 1.7 0 00-2.5-1 1.7 1.7 0 01-2.4-2.4 1.7 1.7 0 00-1.1-2.6 1.7 1.7 0 010-3.4 1.7 1.7 0 001.1-2.5 1.7 1.7 0 012.4-2.4 1.7 1.7 0 002.5-1.1zM15 12a3 3 0 11-6 0 3 3 0 016 0z" },
];

export function Nav({ access, badges = {} }: { access: Access; badges?: Record<string, { count: number; alert?: boolean }> }) {
  const path = usePathname();
  const visible = items.filter(
    (item) =>
      (!item.permission || can(access, item.permission)) &&
      (!item.anyOf || item.anyOf.some((p) => can(access, p))) &&
      !(item.hideWith && can(access, item.hideWith)),
  );
  return (
    <nav className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:overflow-visible md:px-3 md:py-4">
      {visible.map((item) => {
        // The most specific menu entry wins (Marketing vs Email campaigns).
        const matches = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));
        const active = matches(item.href) && !visible.some((o) => o.href.length > item.href.length && o.href.startsWith(item.href) && matches(o.href));
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
            {badges[item.href]?.count ? (
              <span className={`ml-auto rounded-full px-1.5 text-xs font-semibold ${badges[item.href].alert ? "bg-kudu-600 text-white" : "bg-charcoal-600 text-charcoal-100"}`}>
                {badges[item.href].count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
