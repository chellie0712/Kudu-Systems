import Link from "next/link";

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="no-print mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-sm text-charcoal-500 hover:text-kudu-600">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-charcoal-800">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-charcoal-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  );
}

const statusColours: Record<string, string> = {
  DRAFT: "bg-charcoal-100 text-charcoal-600",
  SENT: "bg-sky-100 text-sky-800",
  ACCEPTED: "bg-emerald-100 text-emerald-800",
  DECLINED: "bg-kudu-100 text-kudu-700",
  EXPIRED: "bg-amber-100 text-amber-800",
  SCHEDULED: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-charcoal-100 text-charcoal-500 line-through",
  PARTIALLY_PAID: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  OVERDUE: "bg-kudu-600 text-white",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColours[status] ?? "bg-charcoal-100"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-charcoal-500">{children}</div>;
}

export function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-3 border-b border-charcoal-100 pb-2 text-sm font-bold uppercase tracking-wide text-kudu-600">{children}</h2>;
}

export function Flash({ message, tone = "ok" }: { message?: string; tone?: "ok" | "error" }) {
  if (!message) return null;
  return (
    <div
      className={`no-print mb-4 rounded-md p-3 text-sm ${
        tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-kudu-50 text-kudu-700"
      }`}
    >
      {message}
    </div>
  );
}

/** Numbered section card used by the Job Card & Service Warranty (form and printout). */
export function NumberedSection({
  n,
  title,
  children,
  className = "",
}: {
  n: number;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`break-inside-avoid overflow-hidden rounded-lg border border-charcoal-200 bg-white ${className}`}>
      <div className="flex items-center gap-2 bg-charcoal-800 px-3 py-2 text-sm font-bold tracking-wide text-white">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-kudu-600 text-[11px]">{n}</span>
        {title}
      </div>
      <div className="border-l-4 border-kudu-600 p-4">{children}</div>
    </section>
  );
}
