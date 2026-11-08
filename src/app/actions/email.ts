"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { EmailConsent, type MailAccount } from "@prisma/client";
import { requirePermission, type AppUser } from "@/auth";
import { currentCompany } from "@/lib/db";
import { num, str } from "@/lib/form";
import { encryptSecret, decryptSecret } from "@/lib/secret";
import { audience } from "@/lib/email/audience";
import { siteUrl } from "@/lib/email/links";
import { buildMime } from "@/lib/email/mime";
import { MailError, PROVIDER_DAILY_CAP, forgetToken, sendRaw, smtpError, smtpTransport } from "@/lib/email/providers";
import { composeMessage, renderContext, rotateSecret } from "@/lib/email/sender";

const enc = encodeURIComponent;
const accountUrl = (q: string) => `/account?${q}#mailbox`;
const campaignUrl = (id: string, q: string) => `/marketing/email/${id}?${q}`;
const why = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- My mailbox ----------

/** Connect (or update) an SMTP mailbox. The connection is tested before it is saved. */
export async function saveSmtpMailbox(fd: FormData) {
  const user = await requirePermission("email.connect");
  const { db } = await currentCompany();
  const existing = await db.mailAccount.findUnique({ where: { userId: user.id } });
  const host = str(fd, "smtpHost").toLowerCase();
  const port = Math.round(num(fd, "smtpPort", 587));
  const secure = str(fd, "smtpSecurity") === "ssl";
  const smtpUser = str(fd, "smtpUser") || user.email;
  const typed = String(fd.get("smtpPassword") ?? "");
  // Leaving the password blank keeps the saved one (only if it is an SMTP mailbox already).
  const password = typed || (existing?.provider === "SMTP" ? decryptSecret(existing.secret) : "");
  if (!host || !/^[a-z0-9.-]+$/.test(host)) redirect(accountUrl(`err=${enc("Enter the mail server name, e.g. mail.yourdomain.co.za.")}`));
  if (!(port > 0 && port < 65536)) redirect(accountUrl(`err=${enc("The port must be a number such as 465 or 587.")}`));
  if (!password) redirect(accountUrl(`err=${enc("Enter the mailbox password.")}`));

  const transport = smtpTransport({ host, port, secure, user: smtpUser, password });
  try {
    await transport.verify();
  } catch (e) {
    redirect(accountUrl(`err=${enc(smtpError(e).message)}`));
  } finally {
    transport.close();
  }
  const data = {
    provider: "SMTP" as const,
    email: user.email.toLowerCase(),
    secret: encryptSecret(password),
    smtpHost: host,
    smtpPort: port,
    smtpSecure: secure,
    smtpUser,
    lastError: "",
  };
  if (existing) forgetToken(existing.id);
  await db.mailAccount.upsert({ where: { userId: user.id }, update: data, create: { ...data, userId: user.id, fromName: user.name } });
  revalidatePath("/account");
  redirect(accountUrl(`msg=${enc(`Mailbox connected. Campaigns you send will come from ${user.email}. Send yourself a test to check.`)}`));
}

export async function updateMailboxSettings(fd: FormData) {
  const user = await requirePermission("email.connect");
  const { db } = await currentCompany();
  const acct = await db.mailAccount.findUnique({ where: { userId: user.id } });
  if (!acct) redirect(accountUrl(`err=${enc("Connect a mailbox first.")}`));
  const cap = PROVIDER_DAILY_CAP[acct.provider];
  const dailyLimit = Math.max(1, Math.min(cap, Math.round(num(fd, "dailyLimit", acct.dailyLimit))));
  await db.mailAccount.update({ where: { id: acct.id }, data: { fromName: str(fd, "fromName").slice(0, 100), dailyLimit } });
  revalidatePath("/account");
  redirect(accountUrl(`msg=${enc("Saved.")}`));
}

export async function disconnectMailbox() {
  const user = await requirePermission("email.connect");
  const { db } = await currentCompany();
  const acct = await db.mailAccount.findUnique({ where: { userId: user.id } });
  if (acct) {
    forgetToken(acct.id);
    await db.$transaction([
      db.emailCampaign.updateMany({ where: { senderId: user.id, status: "SENDING" }, data: { status: "PAUSED", pausedReason: `${user.name} disconnected their mailbox.` } }),
      db.mailAccount.delete({ where: { id: acct.id } }),
    ]);
  }
  revalidatePath("/account");
  redirect(accountUrl(`msg=${enc("Mailbox disconnected. Kudu no longer has access to it.")}`));
}

async function sendOne(acct: MailAccount, raw: string, to: string) {
  const { db } = await currentCompany();
  await sendRaw(acct, raw, to, rotateSecret(db, acct.id));
}

/** A short email from the user's mailbox to themselves. */
export async function sendMailboxTest() {
  const user = await requirePermission("email.connect");
  const { db } = await currentCompany();
  const acct = await db.mailAccount.findUnique({ where: { userId: user.id } });
  if (!acct) redirect(accountUrl(`err=${enc("Connect a mailbox first.")}`));
  const raw = buildMime({
    from: { email: acct.email, name: acct.fromName || user.name },
    to: { email: user.email, name: user.name },
    subject: "Kudu test email",
    text: "This is a test from Kudu. Your mailbox is connected and email campaigns you send will come from this address.",
    html: "<p>This is a test from Kudu. Your mailbox is connected and email campaigns you send will come from this address.</p>",
  });
  try {
    await sendOne(acct, raw, user.email);
  } catch (e) {
    await db.mailAccount.update({ where: { id: acct.id }, data: { lastError: why(e).slice(0, 500) } });
    redirect(accountUrl(`err=${enc(`The test did not send: ${why(e)}`)}`));
  }
  await db.mailAccount.update({ where: { id: acct.id }, data: { lastError: "", lastUsedAt: new Date() } });
  redirect(accountUrl(`msg=${enc(`Test sent to ${user.email}. Check your inbox (and spam folder).`)}`));
}

// ---------- Campaigns ----------

function campaignFields(fd: FormData) {
  const type = str(fd, "audType");
  return {
    name: str(fd, "name").slice(0, 150) || "Untitled campaign",
    subject: str(fd, "subject").slice(0, 200),
    preheader: str(fd, "preheader").slice(0, 200),
    body: String(fd.get("body") ?? "").slice(0, 50_000),
    buttonLabel: str(fd, "buttonLabel").slice(0, 60),
    buttonUrl: str(fd, "buttonUrl").slice(0, 1000),
    audBranchId: str(fd, "audBranchId") || null,
    audType: type === "BUSINESS" || type === "INDIVIDUAL" ? type : "",
    audLeadSource: str(fd, "audLeadSource").slice(0, 80),
    audOptedInOnly: str(fd, "audOptedInOnly") === "on",
  };
}

export async function saveCampaign(fd: FormData) {
  const user = await requirePermission("campaigns.edit");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  const data = campaignFields(fd);
  if (data.buttonUrl && !/^https?:\/\//i.test(data.buttonUrl)) {
    redirect(id ? campaignUrl(id, `err=${enc("The button link must start with https://")}`) : `/marketing/email/new?err=${enc("The button link must start with https://")}`);
  }
  if (id) {
    const c = await db.emailCampaign.findUniqueOrThrow({ where: { id } });
    if (c.status !== "DRAFT") redirect(campaignUrl(id, `err=${enc("Only draft campaigns can be changed. Duplicate it to send a new version.")}`));
    await db.emailCampaign.update({ where: { id }, data });
  }
  const saved = id ? { id } : await db.emailCampaign.create({ data: { ...data, createdByName: user.name } });
  revalidatePath("/marketing/email");
  redirect(campaignUrl(saved.id, `msg=${enc("Campaign saved.")}`));
}

export async function duplicateCampaign(fd: FormData) {
  const user = await requirePermission("campaigns.edit");
  const { db } = await currentCompany();
  const c = await db.emailCampaign.findUniqueOrThrow({ where: { id: str(fd, "id") } });
  const copy = await db.emailCampaign.create({
    data: {
      name: `${c.name} (copy)`.slice(0, 150),
      subject: c.subject, preheader: c.preheader, body: c.body, buttonLabel: c.buttonLabel, buttonUrl: c.buttonUrl,
      audBranchId: c.audBranchId, audType: c.audType, audLeadSource: c.audLeadSource, audOptedInOnly: c.audOptedInOnly,
      createdByName: user.name,
    },
  });
  redirect(campaignUrl(copy.id, `msg=${enc("Copy made. Edit it and send when ready.")}`));
}

export async function deleteCampaign(fd: FormData) {
  await requirePermission("campaigns.delete");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  const c = await db.emailCampaign.findUniqueOrThrow({ where: { id } });
  if (c.status === "SENDING") redirect(campaignUrl(id, `err=${enc("Pause or cancel the campaign before deleting it.")}`));
  await db.emailCampaign.delete({ where: { id } });
  revalidatePath("/marketing/email");
  redirect(`/marketing/email?msg=${enc("Campaign deleted.")}`);
}

async function myMailbox(user: AppUser, back: string): Promise<MailAccount> {
  const { db } = await currentCompany();
  const acct = await db.mailAccount.findUnique({ where: { userId: user.id } });
  if (!acct) redirect(`${back}${back.includes("?") ? "&" : "?"}err=${enc("Connect your mailbox on My profile first. Campaigns go out from your own email address.")}`);
  if (acct.email.toLowerCase() !== user.email.toLowerCase()) {
    redirect(`${back}${back.includes("?") ? "&" : "?"}err=${enc(`Your mailbox (${acct.email}) is not your sign-in address (${user.email}). Connect it again on My profile.`)}`);
  }
  return acct;
}

/** Sends the campaign, as one sample customer would get it, to the user's own inbox. */
export async function sendCampaignTest(fd: FormData) {
  const user = await requirePermission("campaigns.edit");
  const { company, db } = await currentCompany();
  const id = str(fd, "id");
  const back = campaignUrl(id, "");
  const acct = await myMailbox(user, back);
  const c = await db.emailCampaign.findUniqueOrThrow({ where: { id } });
  if (!c.subject.trim() || !c.body.trim()) redirect(campaignUrl(id, `err=${enc("Add a subject and a message first.")}`));
  const [sample] = await audience(db, c);
  const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const base = await siteUrl();
  const ctx = renderContext(company, settings, base, { name: user.name }, {
    id: "test",
    name: sample?.name ?? "Sample Customer",
    contactPerson: sample?.contactPerson ?? "",
    type: "BUSINESS",
  });
  const raw = composeMessage({ ...c, subject: `[TEST] ${c.subject}` }, acct, ctx, { email: user.email, name: user.name }, null);
  try {
    await sendOne(acct, raw, user.email);
  } catch (e) {
    redirect(campaignUrl(id, `err=${enc(`The test did not send: ${e instanceof MailError ? e.message : why(e)}`)}`));
  }
  redirect(campaignUrl(id, `msg=${enc(`Test sent to ${user.email}${sample ? `, filled in as ${sample.name}` : ""}.`)}`));
}

/** Queues everyone in the audience and starts sending from the user's own mailbox. */
export async function startCampaign(fd: FormData) {
  const user = await requirePermission("campaigns.send");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  const acct = await myMailbox(user, campaignUrl(id, ""));
  const c = await db.emailCampaign.findUniqueOrThrow({ where: { id } });
  if (c.status !== "DRAFT") redirect(campaignUrl(id, `err=${enc("This campaign has already been sent.")}`));
  if (!c.subject.trim() || !c.body.trim()) redirect(campaignUrl(id, `err=${enc("Add a subject and a message first.")}`));
  const people = await audience(db, c);
  if (!people.length) redirect(campaignUrl(id, `err=${enc("Nobody in this audience can be emailed. See who is eligible on the Email campaigns page.")}`));
  const base = await siteUrl();
  await db.$transaction([
    db.emailRecipient.createMany({
      data: people.map((p) => ({ campaignId: id, customerId: p.id, email: p.email, name: p.name })),
      skipDuplicates: true,
    }),
    db.emailCampaign.update({ where: { id }, data: { status: "SENDING", senderId: user.id, baseUrl: base, startedAt: new Date(), pausedReason: "" } }),
  ]);
  revalidatePath("/marketing/email");
  redirect(campaignUrl(id, `msg=${enc(`Sending to ${people.length} customer${people.length === 1 ? "" : "s"} from ${acct.email}. Keep this page open to send faster.`)}`));
}

export async function pauseCampaign(fd: FormData) {
  const user = await requirePermission("campaigns.send");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  await db.emailCampaign.updateMany({ where: { id, status: "SENDING" }, data: { status: "PAUSED", pausedReason: `Paused by ${user.name}.` } });
  redirect(campaignUrl(id, `msg=${enc("Paused. Emails already sent cannot be recalled.")}`));
}

/** Carries on sending, from the mailbox of the person who resumes it. */
export async function resumeCampaign(fd: FormData) {
  const user = await requirePermission("campaigns.send");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  await myMailbox(user, campaignUrl(id, ""));
  await db.emailCampaign.updateMany({ where: { id, status: "PAUSED" }, data: { status: "SENDING", senderId: user.id, pausedReason: "", baseUrl: await siteUrl() } });
  redirect(campaignUrl(id, `msg=${enc(`Sending again, from ${user.email}.`)}`));
}

export async function cancelCampaign(fd: FormData) {
  await requirePermission("campaigns.send");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  await db.$transaction([
    db.emailRecipient.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { status: "SKIPPED", error: "Campaign cancelled." } }),
    db.emailCampaign.updateMany({ where: { id, status: { in: ["SENDING", "PAUSED"] } }, data: { status: "CANCELLED", finishedAt: new Date() } }),
  ]);
  redirect(campaignUrl(id, `msg=${enc("Cancelled. Nobody else will receive it.")}`));
}

/** Puts failed recipients back in the queue (e.g. after fixing the mailbox). */
export async function retryFailed(fd: FormData) {
  const user = await requirePermission("campaigns.send");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  await myMailbox(user, campaignUrl(id, ""));
  const n = await db.emailRecipient.updateMany({ where: { campaignId: id, status: "FAILED" }, data: { status: "QUEUED", error: "", claimedAt: null } });
  if (n.count) {
    await db.emailCampaign.update({ where: { id }, data: { status: "SENDING", senderId: user.id, finishedAt: null, pausedReason: "" } });
  }
  redirect(campaignUrl(id, `msg=${enc(`${n.count} queued again.`)}`));
}

// ---------- Customer consent ----------

export async function setEmailConsent(fd: FormData) {
  const user = await requirePermission("customers.edit");
  const { db } = await currentCompany();
  const id = str(fd, "id");
  const v = str(fd, "emailConsent");
  const consent = v === "OPTED_IN" ? EmailConsent.OPTED_IN : v === "UNSUBSCRIBED" ? EmailConsent.UNSUBSCRIBED : EmailConsent.UNKNOWN;
  const note = str(fd, "consentNote").slice(0, 200);
  await db.customer.update({
    where: { id },
    data: { emailConsent: consent, emailConsentAt: new Date(), emailConsentSource: `Set by ${user.name}${note ? `: ${note}` : ""}` },
  });
  revalidatePath(`/customers/${id}`);
  redirect(`/customers/${id}?msg=${enc("Email marketing preference saved.")}`);
}
