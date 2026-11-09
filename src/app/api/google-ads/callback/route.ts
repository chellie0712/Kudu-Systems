import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { ADS_SCOPE, STATE_COOKIE, adsOAuth, callbackUrl, cleanCustomerId, syncGoogleAds } from "@/lib/googleAds";
import { encryptSecret } from "@/lib/secret";

/** Google sends the admin back here; the refresh token is kept, encrypted, in this company's settings. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}#google-ads`, req.url));
  const user = await getUser();
  if (!user || !can(user, "settings.manage")) return NextResponse.redirect(new URL("/no-access?need=settings.manage", req.url));
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/google-ads" });
  if (url.searchParams.get("error")) return back(`err=${encodeURIComponent(`Google sign-in was cancelled (${url.searchParams.get("error")}).`)}`);
  if (!expected || url.searchParams.get("state") !== expected) return back(`err=${encodeURIComponent("The Google sign-in expired. Please try again.")}`);

  const oauth = adsOAuth(callbackUrl(req));
  let tokens;
  try {
    ({ tokens } = await oauth.getToken(url.searchParams.get("code") ?? ""));
  } catch (e) {
    return back(`err=${encodeURIComponent(`Google sign-in failed: ${e instanceof Error ? e.message : e}`)}`);
  }
  if (!tokens.refresh_token) return back(`err=${encodeURIComponent("Google did not give long-term access. Remove Kudu under your Google account's third-party access, then connect again.")}`);
  if (!tokens.scope?.split(" ").includes(ADS_SCOPE)) return back(`err=${encodeURIComponent("Please tick the Google Ads permission when Google asks, then try again.")}`);

  let email = "";
  if (tokens.id_token) {
    const payload = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    email = payload.email ?? "";
  }
  const db = await tenantDb();
  const s = await db.settings.update({
    where: { id: 1 },
    data: { googleAdsRefreshToken: encryptSecret(tokens.refresh_token), googleAdsAccountEmail: email, googleAdsLastError: "", googleAdsLastSyncAt: null },
  });
  if (cleanCustomerId(s.googleAdsCustomerId).length === 10) {
    try {
      const r = await syncGoogleAds(db);
      return back(`msg=${encodeURIComponent(`Google Ads connected. ${r.rows} campaign-days of spend loaded.`)}`);
    } catch (e) {
      return back(`err=${encodeURIComponent(`Connected, but the first sync failed: ${e instanceof Error ? e.message : e}`)}`);
    }
  }
  return back(`msg=${encodeURIComponent("Google Ads connected. Now enter your Google Ads account number.")}`);
}
