import Link from "next/link";
import { notFound } from "next/navigation";
import type { RecipientStatus } from "@prisma/client";
import { requirePermission } from "@/auth";
import { can } from "@/lib/permissions";
import { currentCompany } from "@/lib/db";
import { getBranches } from "@/lib/branch";
import { fmtDateTime } from "@/lib/format";
import { audience } from "@/lib/email/audience";
import { siteUrl } from "@/lib/email/links";
import { renderEmail } from "@/lib/email/render";
import { renderContext } from "@/lib/email/sender";
import { PROVIDER_LABELS } from "@/lib/email/providers";
import {
  cancelCampaign, deleteCampaign, duplicateCampaign, pauseCampaign, resumeCampaign, retryFailed, sendCampaignTest, startCampaign,
} from "@/app/actions/email";
import { CampaignForm } from "@/components/CampaignForm";
import { CampaignSender } from "@/components/CampaignSender";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Email campaign" };

const STATUSES: RecipientStatus[] = ["QUEUED", "SENDING", "SENT", "FAILED", "SKIPPED"];

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string; show?: string }>;
}) {
  const user = await requirePermission("campaigns.edit");
  const { id } = await params;
  const { msg, err, show } = await searchParams;
  const { company, db } = await currentCompany();
  const c = await db.emailCampaign.findUnique({ where: { id }, include: { sender: { select: { name: true, email: true, mailAccount: { select: { provider: true } } } } } });
  if (!c) notFound();
  const mayEdit = can(user, "campaigns.edit");
  const maySend = can(user, "campaigns.send");
  const mine = await db.mailAccount.findUnique({ where: { userId: user.id }, select: { email: true, provider: true, dailyLimit: true } });
  const isDraft = c.status === "DRAFT";

  const [people, settings, branches, grouped, unsubscribed] = await Promise.all([
    isDraft ? audience(db, c) : Promise.resolve([]),
    db.settings.findUniqueOrThrow({ where: { id: 1 } }),
    isDraft ? getBranches() : Promise.resolve([]),
    db.emailRecipient.groupBy({ by: ["status"], where: { campaignId: id }, _count: true }),
    db.emailRecipient.count({ where: { campaignId: id, unsubscribedAt: { not: null } } }),
  ]);
  const n = (s: RecipientStatus) => grouped.find((g) => g.status === s)?._count ?? 0;
  const total = grouped.reduce((s, g) => s + g._count, 0);
  const filter = STATUSES.includes(show as RecipientStatus) ? (show as RecipientStatus) : undefined;
  const recipients = total
    ? await db.emailRecipient.findMany({ where: { campaignId: id, ...(filter ? { status: filter } : {}) }, orderBy: [{ sentAt: "desc" }, { name: "asc" }], take: 500 })
    : [];

  // Preview, as the first customer in the audience would see it.
  const sample = people[0];
  const base = c.baseUrl || (await siteUrl());
  const preview = renderEmail(c, renderContext(company, settings, base, { name: c.sender?.name || user.name }, {
    id: "test",
    name: sample?.name ?? "Sample Customer",
    contactPerson: sample?.contactPerson ?? "",
    type: "BUSINESS",
  }));

  return (
    <div>
      <PageHeader
        back={{ href: "/marketing/email", label: "Email campaigns" }}
        title={<span className="flex items-center gap-3">{c.name} <CampaignStatusBadge status={c.status} /></span>}
        subtitle={[c.createdByName && `Created by ${c.createdByName}`, c.sender && `sent from ${c.sender.email}`, c.startedAt && `started ${fmtDateTime(c.startedAt)}`, c.finishedAt && `finished ${fmtDateTime(c.finishedAt)}`].filter(Boolean).join(" · ")}
        actions={
          <>
            {mayEdit && !isDraft && (
              <form action={duplicateCampaign}><input type="hidden" name="id" value={id} /><button className="btn-outline">Duplicate</button></form>
            )}
            {can(user, "campaigns.delete") && c.status !== "SENDING" && (
              <form action={deleteCampaign}>
                <input type="hidden" name="id" value={id} />
                <ConfirmButton message={`Delete "${c.name}" and its send history? This cannot be undone.`} className="btn-danger">Delete</ConfirmButton>
              </form>
            )}
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {isDraft && (
        <div className="card mb-6 space-y-3 border-l-4 border-kudu-600 p-5">
          <div className="text-sm">
            <strong>{people.length}</strong> customer{people.length === 1 ? "" : "s"} will receive this
            {mine ? <> from <strong>{mine.email}</strong> ({PROVIDER_LABELS[mine.provider]}, up to {mine.dailyLimit} a day)</> : null}.
            {people.length > 0 && (
              <span className="text-charcoal-500"> {people.slice(0, 5).map((p) => p.name).join(", ")}{people.length > 5 ? ` and ${people.length - 5} more` : ""}.</span>
            )}
          </div>
          {!mine ? (
            <p className="text-sm text-amber-800">Connect your mailbox on <Link href="/account#mailbox" className="font-semibold underline">My profile</Link> to send tests or send this campaign.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <form action={sendCampaignTest}><input type="hidden" name="id" value={id} /><button className="btn-outline">Send a test to {user.email}</button></form>
              {maySend && people.length > 0 && (
                <form action={startCampaign}>
                  <input type="hidden" name="id" value={id} />
                  <ConfirmButton
                    className="btn-primary"
                    message={`Send "${c.subject}" to ${people.length} customer${people.length === 1 ? "" : "s"} from ${mine.email}? Emails cannot be recalled once sent.`}
                  >
                    Send now to {people.length}
                  </ConfirmButton>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      {c.status === "SENDING" && (
        <div className="card mb-6 space-y-3 p-5">
          <CampaignSender id={id} total={total} initialDone={total - n("QUEUED")} />
          {c.pausedReason && <p className="text-sm text-amber-800">{c.pausedReason}</p>}
          {maySend && (
            <div className="flex gap-2">
              <form action={pauseCampaign}><input type="hidden" name="id" value={id} /><button className="btn-outline">Pause</button></form>
              <form action={cancelCampaign}><input type="hidden" name="id" value={id} /><ConfirmButton message="Cancel? Customers not yet emailed will not get it." className="btn-danger">Cancel</ConfirmButton></form>
            </div>
          )}
        </div>
      )}

      {c.status === "PAUSED" && (
        <div className="card mb-6 space-y-3 border-l-4 border-kudu-600 p-5">
          <p className="text-sm"><strong>Paused.</strong> {c.pausedReason} {n("QUEUED")} still to send.</p>
          {maySend && (
            <div className="flex flex-wrap gap-2">
              {mine ? (
                <form action={resumeCampaign}><input type="hidden" name="id" value={id} /><button className="btn-primary">Resume from {mine.email}</button></form>
              ) : (
                <Link href="/account#mailbox" className="btn-primary">Connect your mailbox to resume</Link>
              )}
              <form action={cancelCampaign}><input type="hidden" name="id" value={id} /><ConfirmButton message="Cancel? Customers not yet emailed will not get it." className="btn-danger">Cancel campaign</ConfirmButton></form>
            </div>
          )}
        </div>
      )}

      {total > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[["Sent", n("SENT")], ["Waiting", n("QUEUED") + n("SENDING")], ["Failed", n("FAILED")], ["Skipped", n("SKIPPED")], ["Unsubscribed", unsubscribed]].map(([k, v]) => (
            <div key={k} className="card p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">{k}</div>
              <div className={`mt-1 text-xl font-bold ${k === "Failed" && Number(v) > 0 ? "text-kudu-600" : ""}`}>{v}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        {isDraft && mayEdit ? (
          <CampaignForm campaign={c} branches={branches.map((b) => ({ id: b.id, name: b.name }))} />
        ) : (
          <div className="card p-6 text-sm">
            <SectionTitle>Email</SectionTitle>
            <dl className="space-y-3">
              <div><dt className="label">Subject</dt><dd>{c.subject}</dd></div>
              {c.preheader && <div><dt className="label">Preview line</dt><dd>{c.preheader}</dd></div>}
              <div><dt className="label">Message</dt><dd className="whitespace-pre-wrap rounded-md bg-charcoal-50 p-3 font-mono text-[13px]">{c.body}</dd></div>
            </dl>
          </div>
        )}
        <div className="card p-4">
          <SectionTitle>Preview{sample ? `, as ${sample.name} sees it` : ""}</SectionTitle>
          <div className="mb-2 rounded-md bg-charcoal-50 p-3 text-sm">
            <div><span className="text-charcoal-500">From:</span> {c.sender?.name || mine && user.name || "You"} &lt;{c.sender?.email || mine?.email || user.email}&gt;</div>
            <div><span className="text-charcoal-500">Subject:</span> <strong>{preview.subject || "(no subject)"}</strong></div>
          </div>
          <iframe title="Email preview" srcDoc={preview.html} sandbox="" className="h-[720px] w-full rounded-md border border-charcoal-200 bg-white" />
        </div>
      </div>

      {total > 0 && (
        <div className="card mt-6 overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <SectionTitle>Recipients</SectionTitle>
            <div className="ml-auto flex flex-wrap gap-1 text-sm">
              <Link href={`/marketing/email/${id}`} className={`rounded px-2 py-1 ${!filter ? "bg-charcoal-800 text-white" : "bg-charcoal-100"}`}>All {total}</Link>
              {STATUSES.filter((s) => n(s)).map((s) => (
                <Link key={s} href={`/marketing/email/${id}?show=${s}`} className={`rounded px-2 py-1 ${filter === s ? "bg-charcoal-800 text-white" : "bg-charcoal-100"}`}>
                  {s.charAt(0) + s.slice(1).toLowerCase()} {n(s)}
                </Link>
              ))}
              {maySend && n("FAILED") > 0 && c.status !== "SENDING" && c.status !== "CANCELLED" && (
                <form action={retryFailed}><input type="hidden" name="id" value={id} /><button className="btn-outline py-1 text-xs">Retry failed</button></form>
              )}
            </div>
          </div>
          <table className="table">
            <thead><tr><th>Customer</th><th>Email</th><th>Status</th><th>Sent</th><th>Note</th></tr></thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td>{r.customerId ? <Link href={`/customers/${r.customerId}`} className="text-kudu-700 hover:underline">{r.name}</Link> : r.name}</td>
                  <td className="text-sm">{r.email}</td>
                  <td><CampaignStatusBadge status={r.status} />{r.unsubscribedAt && <span className="ml-1 text-xs text-kudu-700">unsubscribed {fmtDateTime(r.unsubscribedAt)}</span>}</td>
                  <td className="text-sm">{r.sentAt ? fmtDateTime(r.sentAt) : "—"}</td>
                  <td className="text-xs text-charcoal-500">{r.error}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {recipients.length === 500 && <p className="p-3 text-xs text-charcoal-500">Showing the first 500.</p>}
        </div>
      )}
    </div>
  );
}
