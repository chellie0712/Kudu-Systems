import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { ADS_SCOPE, STATE_COOKIE, adsOAuth, callbackUrl, googleAdsConfigured } from "@/lib/googleAds";

/** Sends the company admin to Google to allow Kudu to read their Google Ads figures. */
export async function GET(req: Request) {
  const user = await getUser();
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}#google-ads`, req.url));
  if (!user || !can(user, "settings.manage")) return NextResponse.redirect(new URL("/no-access?need=settings.manage", req.url));
  if (!googleAdsConfigured()) return back(`err=${encodeURIComponent("Google Ads is not set up on the server yet.")}`);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/google-ads" });
  const url = adsOAuth(callbackUrl(req)).generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // always returns a refresh token
    scope: [ADS_SCOPE, "openid", "email"],
    state,
    include_granted_scopes: false,
  });
  return NextResponse.redirect(url);
}
