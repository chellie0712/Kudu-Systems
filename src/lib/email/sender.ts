import { EmailConsent, Prisma, type EmailCampaign, type MailAccount, type PrismaClient } from "@prisma/client";
import { MAIN_COMPANY_ID, type Company } from "@/lib/platform";
import { encryptSecret } from "@/lib/secret";
import { dayKey, fromLocalInput } from "@/lib/format";
import { buildMime } from "./mime";
import { renderEmail, type RenderContext } from "./render";
import { oneClickUrl, unsubscribePageUrl } from "./links";
import { MailError, PROVIDER_GAP_MS, sendRaw } from "./providers";

// Campaign sending. Recipients are queued when someone presses Send; batches then go out while
// the campaign page is open (it asks for the next batch until the queue is empty), and the daily
// job (/api/cron/email) picks up whatever is left, e.g. after a mailbox's daily limit.
// Each recipient is claimed with FOR UPDATE SKIP LOCKED, so two open pages and the daily job
// never send the same email twice.

/** A claim older than this means the sender died mid-send. */
const STALE_CLAIM_MS = 15 * 60 * 1000;

export type BatchResult = {
  state: "more" | "done" | "limit" | "paused" | "not-sending";
  sent: number;
  failed: number;
  skipped: number;
  queued: number;
  message: string;
};

type Settings = { companyName: string; address: string; phone: string; email: string; website: string; logo: string | null };

export function renderContext(
  company: Company,
  settings: Settings,
  base: string,
  sender: { name: string },
  recipient: { id: string; name: string; contactPerson: string; type: string },
): RenderContext {
  return {
    customerName: recipient.name,
    contactPerson: recipient.contactPerson,
    customerType: recipient.type,
    company: { name: settings.companyName, address: settings.address, phone: settings.phone, email: settings.email, website: settings.website },
    senderName: sender.name,
    logoUrl: settings.logo || company.id === MAIN_COMPANY_ID ? `${base}/api/email/logo/${encodeURIComponent(company.id)}` : null,
    unsubscribeUrl: unsubscribePageUrl(base, company.id, recipient.id),
  };
}

/** Builds the message for one recipient. */
export function composeMessage(
  campaign: Pick<EmailCampaign, "subject" | "preheader" | "body" | "buttonLabel" | "buttonUrl">,
  account: Pick<MailAccount, "email" | "fromName">,
  ctx: RenderContext,
  to: { email: string; name: string },
  oneClick: string | null,
): string {
  const { subject, html, text } = renderEmail(campaign, ctx);
  return buildMime({
    from: { email: account.email, name: account.fromName || ctx.senderName },
    to,
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": oneClick ? `<${oneClick}>, <${ctx.unsubscribeUrl}>` : `<${ctx.unsubscribeUrl}>`,
      ...(oneClick ? { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : {}),
      Precedence: "bulk",
      "X-Mailer": "Kudu CRM",
    },
  });
}

export function rotateSecret(db: PrismaClient, accountId: string) {
  return async (refreshToken: string) => {
    await db.mailAccount.update({ where: { id: accountId }, data: { secret: encryptSecret(refreshToken) } });
  };
}

/** Campaign emails this user's mailbox has sent today (business time zone). */
export async function sentToday(db: PrismaClient, senderId: string): Promise<number> {
  const start = fromLocalInput(dayKey(new Date()))!;
  return db.emailRecipient.count({ where: { status: "SENT", sentAt: { gte: start }, campaign: { senderId } } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function counts(db: PrismaClient, campaignId: string) {
  const rows = await db.emailRecipient.groupBy({ by: ["status"], where: { campaignId }, _count: true });
  const n = (s: string) => rows.find((r) => r.status === s)?._count ?? 0;
  return { queued: n("QUEUED"), sending: n("SENDING"), sent: n("SENT"), failed: n("FAILED"), skipped: n("SKIPPED") };
}

async function pause(db: PrismaClient, campaignId: string, reason: string) {
  await db.emailCampaign.update({ where: { id: campaignId }, data: { status: "PAUSED", pausedReason: reason.slice(0, 500) } });
}

/** Sends queued recipients of one campaign for up to `budgetMs`. */
export async function sendCampaignBatch(db: PrismaClient, company: Company, campaignId: string, budgetMs: number): Promise<BatchResult> {
  const started = Date.now();
  const tally = { sent: 0, failed: 0, skipped: 0 };
  const result = async (state: BatchResult["state"], message: string): Promise<BatchResult> => ({ state, message, ...tally, queued: (await counts(db, campaignId)).queued });

  const campaign = await db.emailCampaign.findUnique({ where: { id: campaignId }, include: { sender: { include: { mailAccount: true } } } });
  if (!campaign || campaign.status !== "SENDING") return result("not-sending", campaign ? `This campaign is ${campaign.status.toLowerCase()}.` : "Campaign not found.");
  const sender = campaign.sender;
  const account = sender?.mailAccount;
  if (!sender || sender.disabled || !account) {
    await pause(db, campaignId, "The person sending this campaign has no mailbox connected (or their user was disabled). Resume it to send from your own mailbox.");
    return result("paused", "No mailbox connected.");
  }
  if (account.email.toLowerCase() !== (sender.email ?? "").toLowerCase()) {
    await pause(db, campaignId, `${sender.name || sender.email}'s sign-in email changed since they connected their mailbox. They must connect it again on My profile.`);
    return result("paused", "Mailbox address no longer matches the sign-in email.");
  }

  // Claims left by a send that died part-way: we can't know whether those went out.
  await db.emailRecipient.updateMany({
    where: { campaignId, status: "SENDING", claimedAt: { lt: new Date(Date.now() - STALE_CLAIM_MS) } },
    data: { status: "FAILED", error: "Interrupted while sending: it may or may not have been delivered." },
  });

  const settings = await db.settings.findUniqueOrThrow({ where: { id: 1 } });
  const base = campaign.baseUrl || process.env.APP_URL || "";
  const gap = PROVIDER_GAP_MS[account.provider];
  const onRotate = rotateSecret(db, account.id);

  while (Date.now() - started < budgetMs - gap - 5000) {
    // Counted afresh each time, so other pages or the daily job sending at once share the limit.
    if (account.dailyLimit - (await sentToday(db, sender.id)) <= 0) {
      await db.emailCampaign.update({ where: { id: campaignId }, data: { pausedReason: `Daily limit of ${account.dailyLimit} emails from ${account.email} reached. The rest go out tomorrow, automatically or when this page is open.` } });
      return result("limit", "Daily limit reached.");
    }
    const claimed = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "EmailRecipient" SET status = 'SENDING', "claimedAt" = now()
      WHERE id = (SELECT id FROM "EmailRecipient" WHERE "campaignId" = ${campaignId} AND status = 'QUEUED' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id`);
    if (!claimed.length) break;
    const r = await db.emailRecipient.findUniqueOrThrow({
      where: { id: claimed[0].id },
      include: { customer: { select: { id: true, name: true, contactPerson: true, type: true, archived: true, emailConsent: true } } },
    });

    // Re-check right before sending: they may have unsubscribed since the campaign was queued.
    const blocked =
      r.customer?.archived ||
      r.customer?.emailConsent === EmailConsent.UNSUBSCRIBED ||
      (await db.customer.count({ where: { emailConsent: EmailConsent.UNSUBSCRIBED, email: { contains: r.email, mode: "insensitive" } } })) > 0;
    if (blocked) {
      await db.emailRecipient.update({ where: { id: r.id }, data: { status: "SKIPPED", error: "Unsubscribed or archived before their turn." } });
      tally.skipped++;
      continue;
    }

    const ctx = renderContext(company, settings, base, { name: sender.name || sender.email || "" }, {
      id: r.id,
      name: r.customer?.name ?? r.name,
      contactPerson: r.customer?.contactPerson ?? "",
      type: r.customer?.type ?? "BUSINESS",
    });
    const raw = composeMessage(campaign, account, ctx, { email: r.email, name: r.customer?.contactPerson || r.name }, oneClickUrl(base, company.id, r.id));
    try {
      await sendRaw(account, raw, r.email, onRotate);
      await db.emailRecipient.update({ where: { id: r.id }, data: { status: "SENT", sentAt: new Date(), error: "" } });
      tally.sent++;
    } catch (e) {
      const err = e instanceof MailError ? e : new MailError(e instanceof Error ? e.message : String(e), "other");
      if (err.kind === "recipient" || err.kind === "other") {
        await db.emailRecipient.update({ where: { id: r.id }, data: { status: "FAILED", error: err.message.slice(0, 500) } });
        tally.failed++;
      } else {
        // Not this recipient's fault: put them back in the queue.
        await db.emailRecipient.update({ where: { id: r.id }, data: { status: "QUEUED", claimedAt: null } });
        await db.mailAccount.update({ where: { id: account.id }, data: { lastError: err.message.slice(0, 500) } });
        if (err.kind === "auth") {
          await pause(db, campaignId, err.message);
          return result("paused", err.message);
        }
        await db.emailCampaign.update({ where: { id: campaignId }, data: { pausedReason: err.message.slice(0, 500) } });
        return result(err.kind === "limit" ? "limit" : "more", err.message);
      }
    }
    await sleep(gap);
  }

  await db.mailAccount.update({ where: { id: account.id }, data: { lastUsedAt: new Date(), ...(tally.sent ? { lastError: "" } : {}) } });
  const c = await counts(db, campaignId);
  if (c.queued === 0 && c.sending === 0) {
    await db.emailCampaign.updateMany({ where: { id: campaignId, status: "SENDING" }, data: { status: "SENT", finishedAt: new Date(), pausedReason: "" } });
    return { state: "done", message: "All sent.", ...tally, queued: 0 };
  }
  if (tally.sent) await db.emailCampaign.update({ where: { id: campaignId }, data: { pausedReason: "" } });
  return { state: "more", message: "", ...tally, queued: c.queued };
}
