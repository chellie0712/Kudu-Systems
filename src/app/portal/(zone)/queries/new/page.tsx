import { requirePortalUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { portalJobs } from "@/lib/portalData";
import { PORTAL_QUERY_TYPES } from "@/lib/portal";
import { logPortalQuery } from "@/app/actions/portal";
import { PortalBack, PortalNotice } from "@/components/Portal";

export const metadata = { title: "New query" };

export default async function PortalNewQuery({ searchParams }: { searchParams: Promise<{ jobCardId?: string; err?: string }> }) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const { jobCardId, err } = await searchParams;
  const jobs = await db.jobCard.findMany({
    where: portalJobs(user.customerId),
    orderBy: [{ jobDate: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 30,
    select: { id: true, number: true, jobType: true, jobDate: true, scheduledStart: true },
  });
  const about = jobs.find((j) => j.id === jobCardId);
  return (
    <div className="max-w-xl">
      <PortalBack href="/portal/queries" label="Queries" />
      <h1 className="mb-1 text-2xl font-bold">Ask a question or book a service</h1>
      <p className="mb-4 text-sm text-charcoal-500">We&apos;ll get back to you. You can follow the status under Queries.</p>
      <PortalNotice err={err} />
      <form action={logPortalQuery} className="card space-y-4 p-5">
        <label className="block">
          <span className="label">What is it about?</span>
          <select name="category" className="input" defaultValue={about ? "Re-service request" : "General enquiry"}>
            {PORTAL_QUERY_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Subject</span>
          <input name="subject" required maxLength={200} className="input" placeholder="e.g. Still seeing cockroaches in the kitchen" />
        </label>
        <label className="block">
          <span className="label">Details</span>
          <textarea name="description" rows={5} maxLength={5000} className="input" placeholder="Where, when, and anything else that helps" />
        </label>
        {jobs.length > 0 && (
          <label className="block">
            <span className="label">Related visit (optional)</span>
            <select name="jobCardId" className="input" defaultValue={about?.id ?? ""}>
              <option value="">None</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>{[j.number, fmtDate(j.jobDate ?? j.scheduledStart), j.jobType].filter(Boolean).join(" · ")}</option>
              ))}
            </select>
          </label>
        )}
        <button className="btn-primary w-full py-2.5">Send</button>
      </form>
    </div>
  );
}
