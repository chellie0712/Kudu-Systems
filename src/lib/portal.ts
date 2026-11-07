import { randomBytes } from "crypto";

/** How long an invite or new-password link stays valid. */
export const INVITE_DAYS = 14;

export function newInviteToken() {
  return { inviteToken: randomBytes(24).toString("base64url"), inviteExpiresAt: new Date(Date.now() + INVITE_DAYS * 86400000) };
}

/** Path of the link a customer opens to set their password. */
export const invitePath = (companySlug: string, token: string) => `/portal/invite/${companySlug}/${token}`;

/** What the customer may pick when they log a query in the portal. */
export const PORTAL_QUERY_TYPES = ["General enquiry", "Re-service request", "Quotation request", "Booking change", "Billing / invoice", "Complaint"] as const;

export const MIN_PASSWORD = 8;
