import { EmailConsent, type PrismaClient } from "@prisma/client";

/** Addresses listed in a customer's email field. */
const addresses = (field: string) => field.toLowerCase().split(/[;,\s]+/).filter((e) => e.includes("@"));

/**
 * Opts an email address out of marketing: every customer record with that address is marked
 * Unsubscribed, and it is taken out of any campaign still sending. Safe to call twice.
 */
export async function unsubscribeRecipient(db: PrismaClient, recipientId: string, how: string): Promise<{ email: string } | null> {
  const r = await db.emailRecipient.findUnique({ where: { id: recipientId }, include: { campaign: { select: { name: true } } } });
  if (!r) return null;
  const email = r.email.toLowerCase();
  const source = `${how} in "${r.campaign.name}"`.slice(0, 300);
  const now = new Date();
  const candidates = await db.customer.findMany({ where: { email: { contains: email, mode: "insensitive" } }, select: { id: true, email: true, emailConsent: true } });
  const ids = candidates.filter((c) => addresses(c.email).includes(email) || c.id === r.customerId).map((c) => c.id);
  if (r.customerId && !ids.includes(r.customerId)) ids.push(r.customerId);
  await db.$transaction([
    db.emailRecipient.updateMany({ where: { id: r.id, unsubscribedAt: null }, data: { unsubscribedAt: now } }),
    db.customer.updateMany({
      where: { id: { in: ids }, emailConsent: { not: EmailConsent.UNSUBSCRIBED } },
      data: { emailConsent: EmailConsent.UNSUBSCRIBED, emailConsentAt: now, emailConsentSource: source },
    }),
    db.emailRecipient.updateMany({
      where: { email, status: "QUEUED" },
      data: { status: "SKIPPED", error: "Unsubscribed." },
    }),
  ]);
  return { email };
}
