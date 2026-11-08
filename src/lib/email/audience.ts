import { EmailConsent, InvoiceStatus, type CustomerType, type Prisma, type PrismaClient } from "@prisma/client";

// Who may receive a marketing email (POPIA, section 69):
//   - a customer who gave consent (OPTED_IN), or
//   - an existing customer: someone we have sold to (an issued invoice), about our own similar
//     services, as long as every email lets them opt out, and they have not opted out.
// Never: anyone who unsubscribed, archived customers, or customers without an email address.

export const CONSENT_LABELS: Record<EmailConsent, string> = {
  UNKNOWN: "Not asked (existing-customer rule)",
  OPTED_IN: "Opted in",
  UNSUBSCRIBED: "Unsubscribed / do not email",
};

export const CONSENT_HELP: Record<EmailConsent, string> = {
  UNKNOWN: "Gets marketing email only once they have an issued invoice (they are then an existing customer). Every email has an unsubscribe link.",
  OPTED_IN: "They told you they want marketing email. Note how and when they agreed, in case you are ever asked to show it.",
  UNSUBSCRIBED: "Never sent marketing email. Invoices, quotations and other service emails are not affected.",
};

export type AudienceFilter = {
  audBranchId: string | null;
  audType: string;
  audLeadSource: string;
  audOptedInOnly: boolean;
};

const sold = { invoices: { some: { status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.CANCELLED] } } } } satisfies Prisma.CustomerWhereInput;

/** Customers that can lawfully receive marketing email (before the campaign's own filters). */
export const eligibleWhere: Prisma.CustomerWhereInput = {
  archived: false,
  email: { contains: "@" },
  OR: [{ emailConsent: EmailConsent.OPTED_IN }, { emailConsent: EmailConsent.UNKNOWN, ...sold }],
};

export function audienceWhere(f: AudienceFilter): Prisma.CustomerWhereInput {
  return {
    AND: [
      f.audOptedInOnly ? { archived: false, email: { contains: "@" }, emailConsent: EmailConsent.OPTED_IN } : eligibleWhere,
      f.audBranchId ? { branchId: f.audBranchId } : {},
      f.audType === "BUSINESS" || f.audType === "INDIVIDUAL" ? { type: f.audType as CustomerType } : {},
      f.audLeadSource ? { leadSource: f.audLeadSource } : {},
    ],
  };
}

/** The first valid address in the customer's email field (it sometimes holds several). */
export function primaryEmail(field: string): string | null {
  const first = field.split(/[;,\s]+/).find((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  return first ? first.toLowerCase() : null;
}

export type AudienceRow = { id: string; name: string; contactPerson: string; email: string };

/** The campaign's recipients right now, one per email address. */
export async function audience(db: Pick<PrismaClient, "customer">, f: AudienceFilter): Promise<AudienceRow[]> {
  const rows = await db.customer.findMany({
    where: audienceWhere(f),
    select: { id: true, name: true, contactPerson: true, email: true },
    orderBy: { name: "asc" },
  });
  const seen = new Set<string>();
  const out: AudienceRow[] = [];
  for (const r of rows) {
    const email = primaryEmail(r.email);
    if (!email || seen.has(email)) continue;
    seen.add(email);
    out.push({ ...r, email });
  }
  return out;
}

/** Headline numbers for the campaigns page. */
export async function consentCounts(db: Pick<PrismaClient, "customer">) {
  const withEmail = { archived: false, email: { contains: "@" } } satisfies Prisma.CustomerWhereInput;
  const [optedIn, existing, unsubscribed, notYet, noEmail] = await Promise.all([
    db.customer.count({ where: { ...withEmail, emailConsent: EmailConsent.OPTED_IN } }),
    db.customer.count({ where: { ...withEmail, emailConsent: EmailConsent.UNKNOWN, ...sold } }),
    db.customer.count({ where: { ...withEmail, emailConsent: EmailConsent.UNSUBSCRIBED } }),
    db.customer.count({ where: { ...withEmail, emailConsent: EmailConsent.UNKNOWN, NOT: sold } }),
    db.customer.count({ where: { archived: false, NOT: { email: { contains: "@" } } } }),
  ]);
  return { optedIn, existing, unsubscribed, notYet, noEmail, eligible: optedIn + existing };
}
