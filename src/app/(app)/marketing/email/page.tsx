import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { consentCounts } from "@/lib/email/audience";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";
import { CampaignStatusBadge } from "@/components/CampaignStatusBadge";

export const metadata = { title: "Email campaigns" };

export default async function EmailCampaignsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("campaigns.edit");
  const { msg, err } = await searchParams;
  const db = await tenantDb();
  const [campaigns, counts, mailbox] = await Promise.all([
    db.emailCampaign.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { sender: { select: { name: true, email: true } }, _count: { select: { recipients: true } } },
    }),
    consentCounts(db),
    db.mailAccount.findUnique({ where: { userId: user.id }, select: { email: true } }),
  ]);
  const sentCounts = await db.emailRecipient.groupBy({ by: ["campaignId"], where: { status: "SENT" }, _count: true });
  const unsubCounts = await db.emailRecipient.groupBy({ by: ["campaignId"], where: { unsubscribedAt: { not: null } }, _count: true });
  const sentOf = (id: string) => sentCounts.find((r) => r.campaignId === id)?._count ?? 0;
  const unsubOf = (id: string) => unsubCounts.find((r) => r.campaignId === id)?._count ?? 0;

  return (
    <div>
      <PageHeader
        title="Email campaigns"
        subtitle="Marketing email to your customers, sent from your own mailbox."
        actions={<Link href="/marketing/email/new" className="btn-primary">+ New campaign</Link>}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {!mailbox && (
        <div className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
          Your mailbox is not connected yet, so you can write campaigns but not send them. <Link href="/account#mailbox" className="font-semibold underline">Connect it on My profile</Link>.
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          ["Can be emailed", counts.eligible, "Opted in, or existing customers"],
          ["Opted in", counts.optedIn, "Gave consent"],
          ["Existing customers", counts.existing, "Issued invoice, not unsubscribed"],
          ["Not yet a customer", counts.notYet, "No invoice and no consent: not emailed"],
          ["Unsubscribed", counts.unsubscribed, "Never emailed again"],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="card p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-charcoal-500">{label}</div>
            <div className={`mt-1 text-xl font-bold ${label === "Can be emailed" ? "text-kudu-600" : ""}`}>{value}</div>
            <div className="text-xs text-charcoal-400">{hint}</div>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        {campaigns.length === 0 ? (
          <Empty>No campaigns yet. <Link className="text-kudu-600 underline" href="/marketing/email/new">Write your first one</Link>.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Campaign</th><th>Status</th><th>Sent from</th><th className="text-right">Sent</th><th className="text-right">Unsubscribed</th><th>Started</th></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/marketing/email/${c.id}`} className="font-medium text-kudu-700 hover:underline">{c.name}</Link>
                    <div className="text-xs text-charcoal-500">{c.subject || "No subject yet"}</div>
                  </td>
                  <td><CampaignStatusBadge status={c.status} /></td>
                  <td className="text-sm">{c.sender ? c.sender.email : "—"}</td>
                  <td className="text-right">{c._count.recipients ? `${sentOf(c.id)} / ${c._count.recipients}` : "—"}</td>
                  <td className="text-right">{unsubOf(c.id) || "—"}</td>
                  <td className="text-sm">{c.startedAt ? fmtDateTime(c.startedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card mt-6 p-6 text-sm text-charcoal-600">
        <SectionTitle>Who is emailed, and why (POPIA)</SectionTitle>
        <p className="mb-2">
          South Africa&apos;s POPIA (section 69) allows marketing email to people who <strong>opted in</strong>, and to <strong>existing customers</strong>{" "}
          about your own similar services, as long as every email lets them opt out. Kudu therefore only sends to customers marked Opted in, or who have
          an issued invoice. Leads with no invoice are never emailed until you record their consent on their customer page.
        </p>
        <p>
          Every email carries your company details and an unsubscribe link (plus the one-click unsubscribe button Gmail and Outlook show). Unsubscribing
          marks every customer with that email address as Unsubscribed, immediately, including campaigns still sending.
        </p>
      </div>
    </div>
  );
}
