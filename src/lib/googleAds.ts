import { google } from "googleapis";
import type { PrismaClient } from "@prisma/client";
import { decryptSecret } from "@/lib/secret";
import { GOOGLE_ADS } from "@/lib/marketing";

// Google Ads API over REST. Access is granted to Kudu's Google Cloud project (Explorer level or
// higher); each company connects its own Google account and picks its own Ads account.
// https://developers.google.com/google-ads/api/rest/common/search

export const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const API_VERSION = process.env.GOOGLE_ADS_API_VERSION || "v26";
const clientId = () => process.env.GOOGLE_ADS_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "";
const clientSecret = () => process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "";

export const STATE_COOKIE = "kudu_gads_state";

/** Where Google sends the admin back to. Must be listed as a redirect URI on the OAuth client. */
export const callbackUrl = (req: Request) => process.env.GOOGLE_ADS_REDIRECT_URI || `${new URL(req.url).origin}/api/google-ads/callback`;

export const googleAdsConfigured = () => Boolean(clientId() && clientSecret());

export function adsOAuth(redirectUri?: string) {
  return new google.auth.OAuth2(clientId(), clientSecret(), redirectUri);
}

/** Digits only: Google shows account numbers as 123-456-7890. */
export const cleanCustomerId = (s: string) => s.replace(/\D/g, "");

export class GoogleAdsError extends Error {}

/** Turns Google's error body into one readable sentence. */
function explain(status: number, body: unknown): string {
  const b = body as { error?: { message?: string; status?: string; details?: { errors?: { message?: string }[] }[] } } | null;
  const detail = b?.error?.details?.flatMap((d) => d.errors ?? []).map((e) => e.message).filter(Boolean)[0];
  const msg = detail || b?.error?.message || `HTTP ${status}`;
  if (status === 401) return `Google refused the sign-in (${msg}). Connect Google Ads again.`;
  if (status === 403) return `Google Ads access denied: ${msg}`;
  return `Google Ads error: ${msg}`;
}

type Row = {
  segments?: { date?: string };
  campaign?: { id?: string; name?: string };
  customer?: { currencyCode?: string; descriptiveName?: string };
  metrics?: { costMicros?: string; clicks?: string; impressions?: string; conversions?: number };
};

async function search(accessToken: string, customerId: string, query: string): Promise<Row[]> {
  const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  // Only needed when the Ads account sits under a manager account the signed-in user reaches it through.
  if (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) headers["login-customer-id"] = cleanCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);
  // Optional since September 2026 (access comes from the Cloud project); sent if still configured.
  if (process.env.GOOGLE_ADS_DEVELOPER_TOKEN) headers["developer-token"] = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const res = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
    cache: "no-store",
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new GoogleAdsError(explain(res.status, Array.isArray(body) ? body[0] : body));
  return ((body as { results?: Row[] }[]) ?? []).flatMap((chunk) => chunk.results ?? []);
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Pulls spend per campaign per day into AdSpend. The first sync goes back 13 months; later ones
 * refresh the last 30 days, because Google keeps updating conversions for a while.
 */
export async function syncGoogleAds(db: PrismaClient): Promise<{ rows: number; from: string; to: string }> {
  const settings = await db.settings.findUnique({ where: { id: 1 } });
  try {
    if (!googleAdsConfigured()) throw new GoogleAdsError("Google Ads is not set up on this server (GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET).");
    if (!settings?.googleAdsRefreshToken) throw new GoogleAdsError("Google Ads is not connected.");
    const customerId = cleanCustomerId(settings.googleAdsCustomerId);
    if (customerId.length !== 10) throw new GoogleAdsError("Enter your 10-digit Google Ads account number in Settings.");

    const oauth = adsOAuth();
    oauth.setCredentials({ refresh_token: decryptSecret(settings.googleAdsRefreshToken) });
    const { token } = await oauth.getAccessToken().catch((e) => {
      const why = e instanceof Error ? e.message : String(e);
      if (/invalid_client|unauthorized_client/.test(why)) {
        throw new GoogleAdsError(`The server's Google Ads client ID or secret is wrong (${why}). Check GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET.`);
      }
      throw new GoogleAdsError(`Google refused the sign-in (${why}). Connect Google Ads again.`);
    });
    if (!token) throw new GoogleAdsError("Google did not return an access token. Connect Google Ads again.");

    const [account] = await search(token, customerId, "SELECT customer.currency_code, customer.descriptive_name FROM customer");
    const to = new Date();
    const from = new Date(to.getTime() - (settings.googleAdsLastSyncAt ? 30 : 400) * 86400000);
    const rows = await search(
      token,
      customerId,
      `SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
       FROM campaign WHERE segments.date BETWEEN '${day(from)}' AND '${day(to)}'`,
    );
    const data = rows
      .filter((r) => r.segments?.date && r.campaign?.id)
      .map((r) => ({
        date: new Date(`${r.segments!.date}T00:00:00Z`),
        channel: GOOGLE_ADS,
        campaignId: r.campaign!.id!,
        campaign: r.campaign!.name ?? r.campaign!.id!,
        // micros of the account currency -> cents
        cost: Math.round(Number(r.metrics?.costMicros ?? 0) / 10000),
        clicks: Number(r.metrics?.clicks ?? 0),
        impressions: Number(r.metrics?.impressions ?? 0),
        conversions: Number(r.metrics?.conversions ?? 0),
      }));
    // Replace the window with Google's current numbers (days with no spend return no row).
    await db.$transaction([
      db.adSpend.deleteMany({ where: { channel: GOOGLE_ADS, date: { gte: new Date(`${day(from)}T00:00:00Z`) } } }),
      db.adSpend.createMany({ data }),
      db.settings.update({
        where: { id: 1 },
        data: { googleAdsLastSyncAt: new Date(), googleAdsLastError: "", googleAdsCurrency: account?.customer?.currencyCode ?? "" },
      }),
    ]);
    return { rows: data.length, from: day(from), to: day(to) };
  } catch (e) {
    const message = e instanceof GoogleAdsError ? e.message : `Google Ads sync failed: ${e instanceof Error ? e.message : String(e)}`;
    await db.settings.update({ where: { id: 1 }, data: { googleAdsLastError: message.slice(0, 500) } }).catch(() => undefined);
    throw new GoogleAdsError(message);
  }
}
