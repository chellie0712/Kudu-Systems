import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { DELIVERY_STATUS, MAX_ATTEMPTS, WEBHOOK_EVENTS } from "@/lib/integrations/defs";
import { openSecret } from "@/lib/integrations/webhooks";
import { deleteWebhook, retryDelivery, rotateWebhookSecret, saveWebhook, testWebhook } from "@/app/actions/integrations";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Secret } from "@/components/Integrations";
import { Empty, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "Webhook" };

const groups = [...new Set(WEBHOOK_EVENTS.map((e) => e.group))];
const statusTone: Record<string, string> = { OK: "bg-emerald-100 text-emerald-800", PENDING: "bg-amber-100 text-amber-800", FAILED: "bg-kudu-100 text-kudu-700" };

export default async function WebhookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("integrations.manage");
  const { id } = await params;
  const { msg, err } = await searchParams;
  const db = await tenantDb();
  const hook = id === "new" ? null : await db.webhook.findUnique({ where: { id } });
  if (id !== "new" && !hook) notFound();
  const [deliveries, usedBy] = hook
    ? await Promise.all([
        db.webhookDelivery.findMany({ where: { webhookId: hook.id }, orderBy: { createdAt: "desc" }, take: 50 }),
        db.workflow.findMany({ select: { id: true, name: true, actions: true } }).then((ws) => ws.filter((w) => JSON.stringify(w.actions).includes(hook.id))),
      ])
    : [[], []];
  let secret = "";
  try {
    secret = hook ? openSecret(hook.secret) : "";
  } catch {
    secret = "";
  }

  return (
    <div>
      <PageHeader back={{ href: "/settings/api", label: "API & webhooks" }} title={hook ? hook.name : "New webhook"} />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      {hook && !hook.active && hook.lastError.startsWith("Switched off") && <Flash message={hook.lastError} tone="error" />}

      <form action={saveWebhook} className="card space-y-4 p-6">
        {hook && <input type="hidden" name="id" value={hook.id} />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Name</span>
            <input name="name" className="input" defaultValue={hook?.name ?? ""} placeholder="e.g. Zapier: completed jobs" maxLength={80} required />
          </label>
          <label className="block">
            <span className="label">Address (URL) to send to</span>
            <input name="url" className="input font-mono text-sm" defaultValue={hook?.url ?? ""} placeholder="https://hooks.zapier.com/hooks/catch/…" required />
          </label>
        </div>
        <fieldset>
          <legend className="label">Send a message when</legend>
          <p className="mb-2 text-xs text-charcoal-500">Tick nothing if only a workflow should send to it (a workflow step can also add conditions, such as “only jobs over R5 000”).</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-1 text-xs font-semibold text-charcoal-700">{g}</div>
                {WEBHOOK_EVENTS.filter((e) => e.group === g).map((e) => (
                  <label key={e.key} className="flex items-start gap-2 py-0.5 text-sm">
                    <input type="checkbox" name="events" value={e.key} defaultChecked={hook?.events.includes(e.key)} className="mt-1" />
                    <span>{e.label} <code className="text-[10px] text-charcoal-400">{e.key}</code></span>
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={hook ? hook.active : true} /> Switched on
        </label>
        <button className="btn-primary">{hook ? "Save" : "Add webhook"}</button>
      </form>

      {hook && (
        <>
          <div className="card mt-6 space-y-3 p-6">
            <SectionTitle>Signing secret</SectionTitle>
            <p className="text-sm text-charcoal-500">
              Every message carries a <code>Kudu-Signature</code> header made with this secret, so the other system can check the message really came from Kudu. See{" "}
              <a href="/settings/api/docs#signatures" className="text-kudu-600">how to check it</a>. Zapier and Make don&apos;t need it.
            </p>
            {secret ? <Secret value={secret} label="Signing secret" /> : <p className="text-sm text-kudu-700">The secret can&apos;t be read (the server&apos;s AUTH_SECRET changed). Make a new one.</p>}
            <div className="flex flex-wrap gap-2">
              <form action={testWebhook}>
                <input type="hidden" name="id" value={hook.id} />
                <button className="btn-outline">Send test</button>
              </form>
              <form action={rotateWebhookSecret}>
                <input type="hidden" name="id" value={hook.id} />
                <ConfirmButton message="Make a new signing secret? The other system must be given the new one, or it will reject messages that it checks." className="btn-outline">New secret</ConfirmButton>
              </form>
              <form action={deleteWebhook}>
                <input type="hidden" name="id" value={hook.id} />
                <ConfirmButton message={`Delete “${hook.name}” and its history?${usedBy.length ? ` Workflows that send to it will fail: ${usedBy.map((w) => w.name).join(", ")}.` : ""}`}>Delete</ConfirmButton>
              </form>
            </div>
            {usedBy.length > 0 && <p className="text-xs text-charcoal-500">Used by the workflows: {usedBy.map((w) => w.name).join(", ")}.</p>}
          </div>

          <div className="card mt-6 p-6">
            <SectionTitle>Recent messages</SectionTitle>
            <p className="mb-3 text-xs text-charcoal-500">The last 50, kept for 30 days. A message is tried up to {MAX_ATTEMPTS} times.</p>
            {deliveries.length === 0 ? (
              <Empty>Nothing sent yet. Press Send test.</Empty>
            ) : (
              <ul className="divide-y divide-charcoal-100 rounded-md border border-charcoal-100">
                {deliveries.map((d) => (
                  <li key={d.id} className="p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone[d.status] ?? ""}`}>{DELIVERY_STATUS[d.status] ?? d.status}</span>
                        <code className="text-xs">{d.event}</code>
                        <span className="text-xs text-charcoal-500">{fmtDateTime(d.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-charcoal-500">
                        <span>
                          {d.attempts} {d.attempts === 1 ? "try" : "tries"}
                          {d.responseStatus ? ` · answered ${d.responseStatus}` : ""}
                          {d.status === "PENDING" && d.nextAttemptAt ? ` · next ${fmtDateTime(d.nextAttemptAt)}` : ""}
                        </span>
                        {d.status !== "OK" && (
                          <form action={retryDelivery}>
                            <input type="hidden" name="id" value={d.id} />
                            <button className="btn-outline py-0.5 text-xs">Try again now</button>
                          </form>
                        )}
                      </div>
                    </div>
                    {d.error && <div className="mt-1 text-xs text-kudu-700">{d.error}</div>}
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-charcoal-500">What was sent{d.responseBody ? " and the answer" : ""}</summary>
                      <pre className="mt-1 max-h-64 overflow-auto rounded bg-charcoal-50 p-2">{JSON.stringify(d.payload, null, 2)}</pre>
                      {d.responseBody && <pre className="mt-1 max-h-32 overflow-auto rounded bg-charcoal-50 p-2">{d.responseBody}</pre>}
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
