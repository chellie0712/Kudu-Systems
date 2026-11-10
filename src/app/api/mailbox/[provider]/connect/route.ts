import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { MAILBOX_STATE_COOKIE, google, mailboxCallbackUrl, microsoft, providerConfigured } from "@/lib/email/providers";

/** Sends the signed-in user to Google or Microsoft to let Kudu send email from their mailbox. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/account?${q}#mailbox`, req.url));
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(user, "email.connect")) return NextResponse.redirect(new URL("/no-access?need=email.connect", req.url));
  if (provider !== "google" && provider !== "microsoft") return back(`err=${encodeURIComponent("Unknown mail provider.")}`);
  if (!providerConfigured(provider === "google" ? "GOOGLE" : "MICROSOFT")) {
    return back(`err=${encodeURIComponent(`${provider === "google" ? "Gmail" : "Microsoft 365"} connections are not set up on this server yet. Use "Other mailbox (SMTP)" for now.`)}`);
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(MAILBOX_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/api/mailbox" });
  const redirect = mailboxCallbackUrl(req, provider);
  const url =
    provider === "google"
      ? new URL("https://accounts.google.com/o/oauth2/v2/auth")
      : new URL(`https://login.microsoftonline.com/${microsoft.tenant()}/oauth2/v2.0/authorize`);
  const q = url.searchParams;
  q.set("client_id", provider === "google" ? google.clientId() : microsoft.clientId());
  q.set("redirect_uri", redirect);
  q.set("response_type", "code");
  q.set("state", state);
  q.set("login_hint", user.email);
  if (provider === "google") {
    q.set("scope", `openid email ${google.scope}`);
    q.set("access_type", "offline");
    q.set("prompt", "consent"); // always returns a refresh token
    q.set("include_granted_scopes", "false");
  } else {
    q.set("scope", microsoft.scope);
    q.set("response_mode", "query");
    q.set("prompt", "select_account");
  }
  return NextResponse.redirect(url.toString());
}
