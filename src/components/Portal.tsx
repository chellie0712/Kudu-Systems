import Link from "next/link";
import Image from "next/image";
import type { InvoiceStatus, JobCardStatus, QuotationStatus, Settings } from "@prisma/client";

/** Company logo for portal pages shown before sign-in, from the company's own settings. */
export function PortalBrand({ settings }: { settings: Pick<Settings, "logo" | "companyName"> | null }) {
  if (settings?.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={settings.logo} alt={settings.companyName} className="mx-auto mb-6 h-24 w-auto object-contain" />;
  }
  if (settings?.companyName && settings.companyName !== "Kudu Systems") {
    return <div className="mb-6 text-center text-2xl font-extrabold text-charcoal-800">{settings.companyName}</div>;
  }
  return <Image src="/kudu-logo-sm.png" alt="Kudu Systems" width={600} height={389} className="mx-auto mb-6 h-24 w-auto" priority />;
}

const badge = (text: string, colour: string) => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${colour}`}>{text}</span>;

export function QuoteBadge({ status }: { status: QuotationStatus }) {
  const map: Partial<Record<QuotationStatus, [string, string]>> = {
    SENT: ["Awaiting your answer", "bg-amber-100 text-amber-800"],
    ACCEPTED: ["Accepted", "bg-emerald-100 text-emerald-800"],
    DECLINED: ["Declined", "bg-charcoal-100 text-charcoal-600"],
    EXPIRED: ["Expired", "bg-charcoal-100 text-charcoal-600"],
  };
  const [t, c] = map[status] ?? [status, "bg-charcoal-100"];
  return badge(t, c);
}

export function InvoiceBadge({ status, overdue }: { status: InvoiceStatus; overdue: boolean }) {
  if (status === "PAID") return badge("Paid", "bg-emerald-100 text-emerald-800");
  if (overdue) return badge("Overdue", "bg-kudu-100 text-kudu-800");
  return badge(status === "PARTIALLY_PAID" ? "Part paid" : "Due", "bg-amber-100 text-amber-800");
}

export function ServiceBadge({ status }: { status: JobCardStatus }) {
  if (status === "COMPLETED") return badge("Completed", "bg-emerald-100 text-emerald-800");
  if (status === "IN_PROGRESS") return badge("In progress", "bg-amber-100 text-amber-800");
  return badge("Booked", "bg-sky-100 text-sky-800");
}

/** Back link at the top of portal detail pages. */
export function PortalBack({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="no-print mb-3 inline-block text-sm text-charcoal-500 hover:text-kudu-600">← {label}</Link>;
}

export function PortalNotice({ msg, err }: { msg?: string; err?: string }) {
  return (
    <>
      {msg && <div className="no-print mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{msg}</div>}
      {err && <div className="no-print mb-4 rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">{err}</div>}
    </>
  );
}
