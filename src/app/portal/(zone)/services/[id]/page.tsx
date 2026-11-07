import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDateTime, fmtTime } from "@/lib/format";
import { portalJobs } from "@/lib/portalData";
import { JobCardSheet, jobCardSheetInclude } from "@/components/JobCardSheet";
import { PortalBack, ServiceBadge } from "@/components/Portal";
import { PrintButton } from "@/components/ConfirmButton";

export const metadata = { title: "Service" };

export default async function PortalService({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const { id } = await params;
  const [j, settings] = await Promise.all([
    db.jobCard.findFirst({ where: { id, ...portalJobs(user.customerId) }, include: jobCardSheetInclude }),
    getSettings(),
  ]);
  if (!j) notFound();
  const done = j.status === "COMPLETED";

  return (
    <div>
      <PortalBack href="/portal/services" label="Services" />
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-bold">{j.number} <ServiceBadge status={j.status} /></h1>
        <div className="flex flex-wrap gap-2">
          <Link href={`/portal/queries/new?jobCardId=${j.id}`} className="btn-outline">{done ? "Report a problem / ask for a re-service" : "Ask about this visit"}</Link>
          {done && <PrintButton />}
        </div>
      </div>
      {done ? (
        <JobCardSheet j={j} settings={settings} />
      ) : (
        <div className="card max-w-xl space-y-3 p-5 text-sm">
          <div>
            <div className="text-xs font-semibold text-charcoal-500">When</div>
            <div className="font-medium">
              {j.scheduledStart ? `${fmtDateTime(j.scheduledStart)}${j.scheduledEnd ? ` – ${fmtTime(j.scheduledEnd)}` : ""}` : "Date to be confirmed"}
            </div>
          </div>
          {j.jobType && <div><div className="text-xs font-semibold text-charcoal-500">Service</div><div className="font-medium">{j.jobType}</div></div>}
          {j.technician && <div><div className="text-xs font-semibold text-charcoal-500">Technician</div><div className="font-medium">{j.technician}</div></div>}
          {j.siteAddress && <div><div className="text-xs font-semibold text-charcoal-500">Site</div><div className="font-medium whitespace-pre-line">{j.siteAddress}</div></div>}
          {j.scopeOfWork && <div><div className="text-xs font-semibold text-charcoal-500">Work planned</div><div className="whitespace-pre-line">{j.scopeOfWork}</div></div>}
          <p className="border-t border-charcoal-100 pt-3 text-xs text-charcoal-500">Your job card and service warranty will be here once the work is done and signed off.</p>
        </div>
      )}
    </div>
  );
}
