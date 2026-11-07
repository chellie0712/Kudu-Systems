import Link from "next/link";
import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { portalJobs } from "@/lib/portalData";
import { ServiceBadge } from "@/components/Portal";
import { Empty } from "@/components/ui";

export const metadata = { title: "Services" };

export default async function PortalServices() {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const rows = await db.jobCard.findMany({
    where: portalJobs(user.customerId),
    orderBy: [{ scheduledStart: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
  });
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">Services</h1>
      <p className="mb-4 text-sm text-charcoal-500">Booked visits, and the job card and service warranty for every completed visit.</p>
      <div className="card divide-y divide-charcoal-100">
        {rows.length === 0 && <Empty>No services yet.</Empty>}
        {rows.map((j) => (
          <Link key={j.id} href={`/portal/services/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-charcoal-50">
            <span>
              <span className="font-semibold">
                {j.status === "COMPLETED" ? fmtDate(j.jobDate ?? j.updatedAt) : j.scheduledStart ? fmtDateTime(j.scheduledStart) : "Date to be confirmed"}
              </span>
              <span className="block text-xs text-charcoal-500">{[j.jobType || j.areaTreated, j.number, j.warrantyEnd && j.status === "COMPLETED" && `warranty to ${fmtDate(j.warrantyEnd)}`].filter(Boolean).join(" · ")}</span>
            </span>
            <ServiceBadge status={j.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
