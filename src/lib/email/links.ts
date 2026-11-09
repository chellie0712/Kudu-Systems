import { createHmac, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";

// Unsubscribe links: /unsubscribe/<company id>/<recipient id>.<signature>. The signature (keyed on
// AUTH_SECRET) stops anyone guessing links to unsubscribe other people. The company id, not its
// code, is used so links in old emails keep working if the company code changes.

function sign(companyId: string, recipientId: string): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", `kudu-unsubscribe:${secret}`).update(`${companyId}:${recipientId}`).digest("base64url").slice(0, 32);
}

export function unsubscribeToken(companyId: string, recipientId: string): string {
  return `${recipientId}.${sign(companyId, recipientId)}`;
}

/** The recipient id in a valid token, or null. */
export function readUnsubscribeToken(companyId: string, token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig) return null;
  const expected = Buffer.from(sign(companyId, id));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given) ? id : null;
}

export const unsubscribePageUrl = (base: string, companyId: string, recipientId: string) =>
  `${base}/unsubscribe/${encodeURIComponent(companyId)}/${unsubscribeToken(companyId, recipientId)}`;

/** One-click unsubscribe (RFC 8058): mail apps POST here from their own "Unsubscribe" button. */
export const oneClickUrl = (base: string, companyId: string, recipientId: string) =>
  `${base}/api/unsubscribe/${encodeURIComponent(companyId)}/${unsubscribeToken(companyId, recipientId)}`;

/**
 * The site's public address, for links inside emails. APP_URL wins when set (use it if the site
 * has its own domain); otherwise the address the person is using right now.
 */
export async function siteUrl(): Promise<string> {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
