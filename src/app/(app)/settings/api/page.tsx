import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { siteUrl } from "@/lib/email/links";
import { WEBHOOK_EVENTS } from "@/lib/integrations/defs";
import { revokeApiKey } from "@/app/actions/integrations";
import { ConfirmButton } from "@/components/ConfirmButton";
import { NewApiKey } from "@/components/Integrations";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "API & webhooks" };

const eventLabel = (k: string) => WEBHOOK_EVENTS.find((e) => e.key === k)?.label ?? k;

export default async function ApiPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("integrations.manage");
  const { msg, err } = await searchParams;
  const db = await tenantDb();
  const [keys, hooks, base] = await Promise.all([
    db.apiKey.findMany({ orderBy: [{ revokedAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }] }),
    db.webhook.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { deliveries: { where: { status: "PENDING" } } } } } }),
    siteUrl(),
  ]);

  return (
    <div>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="API & webhooks"
        subtitle="Connect Kudu to other systems: Zapier, Make, your website, a reporting tool or your own software. An API key lets another system look things up in Kudu (and add customers and queries); a webhook tells another system the moment something happens in Kudu."
        actions={<Link href="/settings/api/docs" className="btn-outline">How to use the API</Link>}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="card p-6">
        <SectionTitle>API keys</SectionTitle>
        <p className="mb-4 text-sm text-charcoal-500">
          The other system sends the key with each request to <code className="rounded bg-charcoal-50 px-1">{base}/api/v1</code>. A read-only key can see customers, quotations, job cards, invoices and queries
          (including prices). A read and write key can also add and change customers and log queries. Give each system its own key, so you can revoke one without breaking the others.
        </p>
        <NewApiKey />
        <div className="mt-5 divide-y divide-charcoal-100 rounded-md border border-charcoal-100">
          {keys.length === 0 ? (
            <Empty>No API keys yet.</Empty>
          ) : (
            keys.map((k) => (
              <div key={k.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 text-sm ${k.revokedAt ? "opacity-60" : ""}`}>
                <div>
                  <div className="font-semibold">
                    {k.name} <span className="ml-1 rounded bg-charcoal-100 px-1.5 py-0.5 text-xs font-medium">{k.access === "write" ? "Read and write" : "Read only"}</span>
                    {k.revokedAt && <span className="ml-1 rounded bg-kudu-100 px-1.5 py-0.5 text-xs font-medium text-kudu-700">Revoked {fmtDateTime(k.revokedAt)}</span>}
                  </div>
                  <div className="text-xs text-charcoal-500">
                    <code>{k.prefix}</code> · made by {k.createdBy || "?"} on {fmtDateTime(k.createdAt)} · {k.lastUsedAt ? `last used ${fmtDateTime(k.lastUsedAt)}` : "never used"}
                  </div>
                </div>
                {!k.revokedAt && (
                  <form action={revokeApiKey}>
                    <input type="hidden" name="id" value={k.id} />
                    <ConfirmButton message={`Revoke “${k.name}”? Anything using it stops working straight away. This can't be undone.`} className="btn-outline py-1 text-xs">Revoke</ConfirmButton>
                  </form>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card mt-6 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-charcoal-100 pb-2">
          <h2 className="text-sm font-bold uppercase tracking-wide text-kudu-600">Webhooks</h2>
          <Link href="/settings/api/webhooks/new" className="btn-primary py-1 text-sm">+ New webhook</Link>
        </div>
        <p className="mb-4 text-sm text-charcoal-500">
          Kudu posts a signed JSON message to the address when the things you tick happen, for example a job is completed or a payment is recorded. In Zapier use
          “Webhooks by Zapier → Catch Hook”, in Make “Custom webhook”. A workflow can also send to a webhook as one of its steps. If the other system does not accept a message,
          Kudu tries again after 1 minute, 10 minutes, 1 hour, 6 hours and 1 day.
        </p>
        <div className="divide-y divide-charcoal-100 rounded-md border border-charcoal-100">
          {hooks.length === 0 ? (
            <Empty>No webhooks yet.</Empty>
          ) : (
            hooks.map((h) => (
              <Link key={h.id} href={`/settings/api/webhooks/${h.id}`} className="block p-3 text-sm hover:bg-charcoal-50">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-kudu-700">{h.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${!h.active ? "bg-charcoal-100 text-charcoal-500" : h.failures ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>
                    {!h.active ? "Switched off" : h.failures ? `${h.failures} failed in a row` : "On"}
                  </span>
                </div>
                <div className="truncate font-mono text-xs text-charcoal-500">{h.url}</div>
                <div className="text-xs text-charcoal-500">
                  {h.events.length ? h.events.map(eventLabel).join(" · ") : "Only from workflows"}
                  {h._count.deliveries ? ` · ${h._count.deliveries} waiting to be tried again` : ""}
                </div>
                {h.lastError && h.failures > 0 && <div className="text-xs text-kudu-700">Last problem: {h.lastError}</div>}
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
