import { requireUser } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { PROVIDER_DAILY_CAP, PROVIDER_LABELS, providerConfigured } from "@/lib/email/providers";
import { sentToday } from "@/lib/email/sender";
import { disconnectMailbox, saveSmtpMailbox, sendMailboxTest, updateMailboxSettings } from "@/app/actions/email";
import { ConfirmButton } from "@/components/ConfirmButton";
import { Field, Flash, PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "My profile" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requireUser();
  const { msg, err } = await searchParams;
  const db = await tenantDb();
  const mayConnect = can(user, "email.connect");
  const acct = mayConnect ? await db.mailAccount.findUnique({ where: { userId: user.id } }) : null;
  const today = acct ? await sentToday(db, user.id) : 0;
  const gmail = providerConfigured("GOOGLE");
  const ms = providerConfigured("MICROSOFT");
  const smtp = acct?.provider === "SMTP" ? acct : null;

  return (
    <div className="max-w-3xl">
      <PageHeader title="My profile" subtitle="Your sign-in details and the mailbox your email campaigns are sent from." />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      <div className="card mb-6 p-6">
        <SectionTitle>Sign-in</SectionTitle>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="label">Name</dt><dd>{user.name || "—"}</dd></div>
          <div><dt className="label">Sign-in email</dt><dd>{user.email}</dd></div>
          <div><dt className="label">Role</dt><dd>{user.roleName}</dd></div>
        </dl>
        <p className="mt-3 text-xs text-charcoal-500">An admin can change your name or email in Settings → Users &amp; roles.</p>
      </div>

      {mayConnect && (
        <div id="mailbox" className="card space-y-5 p-6">
          <SectionTitle>Email for sending campaigns</SectionTitle>
          <p className="text-sm text-charcoal-600">
            Campaigns you send go out from <strong>{user.email}</strong>, through your own mailbox, so customers see your address, replies come back
            to you and a copy sits in your Sent folder. Kudu never sees your mailbox&apos;s contents: it can only send.
          </p>

          {acct ? (
            <>
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                Connected: <strong>{acct.email}</strong> via {PROVIDER_LABELS[acct.provider]}
                {acct.provider === "SMTP" && <> ({acct.smtpHost}:{acct.smtpPort})</>}. Sent today: {today} of {acct.dailyLimit}.
                {acct.lastUsedAt && <> Last used {fmtDateTime(acct.lastUsedAt)}.</>}
              </div>
              {acct.lastError && <p className="rounded-md bg-kudu-50 p-3 text-sm text-kudu-800">Last problem: {acct.lastError}</p>}
              <form action={updateMailboxSettings} className="grid gap-4 sm:grid-cols-3 sm:items-end">
                <Field label="Name customers see">
                  <input name="fromName" className="input" defaultValue={acct.fromName || user.name} maxLength={100} />
                </Field>
                <Field label={`Daily limit (max ${PROVIDER_DAILY_CAP[acct.provider]})`}>
                  <input name="dailyLimit" type="number" min={1} max={PROVIDER_DAILY_CAP[acct.provider]} className="input" defaultValue={acct.dailyLimit} />
                </Field>
                <button className="btn-outline">Save</button>
              </form>
              <p className="text-xs text-charcoal-500">
                A free @gmail.com account allows about 500 emails a day, Google Workspace 2,000, Outlook.com about 300 and Microsoft 365 10,000. Most
                hosting mailboxes allow a few hundred an hour. Going over can get the mailbox blocked, so keep the limit below your provider&apos;s.
                When a campaign reaches it, the rest go out the next day.
              </p>
              <div className="flex flex-wrap gap-2">
                <form action={sendMailboxTest}><button className="btn-primary">Send me a test email</button></form>
                <form action={disconnectMailbox}>
                  <ConfirmButton message="Disconnect your mailbox? Campaigns you are sending will pause." className="btn-danger">Disconnect</ConfirmButton>
                </form>
              </div>
            </>
          ) : (
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">No mailbox connected yet. Pick the one that matches {user.email}:</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-charcoal-200 p-4">
              <div className="font-semibold">Gmail / Google Workspace</div>
              <p className="mb-3 text-xs text-charcoal-500">Sign in with Google and allow &quot;Send email on your behalf&quot;.</p>
              {gmail ? (
                <a href="/api/mailbox/google/connect" className={acct?.provider === "GOOGLE" ? "btn-outline" : "btn-primary"}>
                  {acct?.provider === "GOOGLE" ? "Reconnect Google" : "Connect Google"}
                </a>
              ) : (
                <p className="text-xs text-charcoal-500">Not set up on this server yet (the administrator adds a Google OAuth client). Use SMTP below with a Gmail app password meanwhile.</p>
              )}
            </div>
            <div className="rounded-md border border-charcoal-200 p-4">
              <div className="font-semibold">Outlook / Microsoft 365</div>
              <p className="mb-3 text-xs text-charcoal-500">Sign in with Microsoft and allow Kudu to send mail as you.</p>
              {ms ? (
                <a href="/api/mailbox/microsoft/connect" className={acct?.provider === "MICROSOFT" ? "btn-outline" : "btn-primary"}>
                  {acct?.provider === "MICROSOFT" ? "Reconnect Microsoft" : "Connect Microsoft"}
                </a>
              ) : (
                <p className="text-xs text-charcoal-500">Not set up on this server yet (the administrator registers a Microsoft app).</p>
              )}
            </div>
          </div>

          <details className="rounded-md border border-charcoal-200 p-4" open={!acct && !gmail && !ms}>
            <summary className="cursor-pointer font-semibold">Other mailbox (SMTP): website hosting mail, Afrihost, Xneelo, Gmail app password…</summary>
            <form action={saveSmtpMailbox} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Mail server (SMTP host)">
                <input name="smtpHost" required className="input" defaultValue={smtp?.smtpHost} placeholder="mail.yourdomain.co.za" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Port">
                  <input name="smtpPort" type="number" required className="input" defaultValue={smtp?.smtpPort ?? 465} />
                </Field>
                <Field label="Security">
                  <select name="smtpSecurity" className="input" defaultValue={smtp ? (smtp.smtpSecure ? "ssl" : "starttls") : "ssl"}>
                    <option value="ssl">SSL/TLS (465)</option>
                    <option value="starttls">STARTTLS (587)</option>
                  </select>
                </Field>
              </div>
              <Field label="Username">
                <input name="smtpUser" className="input" defaultValue={smtp?.smtpUser || user.email} autoComplete="off" />
              </Field>
              <Field label={smtp ? "Password (leave blank to keep the saved one)" : "Password"}>
                <input name="smtpPassword" type="password" className="input" autoComplete="new-password" required={!smtp} />
              </Field>
              <div className="sm:col-span-2">
                <p className="mb-3 text-xs text-charcoal-500">
                  Your email host lists these under &quot;email client settings&quot; or &quot;outgoing server&quot;. For Gmail use smtp.gmail.com, port 465,
                  and an <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">app password</a> (needs
                  2-step verification). Microsoft 365 is retiring password sign-in for SMTP, so use &quot;Connect Microsoft&quot; instead. Kudu
                  tests the connection before saving, and stores the password encrypted.
                </p>
                <button className="btn-primary">{smtp ? "Update and test" : "Connect and test"}</button>
              </div>
            </form>
          </details>
        </div>
      )}
    </div>
  );
}
