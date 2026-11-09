import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { encryptSecret } from "@/lib/secret";
import { MAILBOX_STATE_COOKIE, PROVIDER_DAILY_CAP, forgetToken, google, mailboxCallbackUrl, microsoft } from "@/lib/email/providers";

const decodeJwt = (jwt: string) => JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8") || "{}") as Record<string, unknown>;

/**
 * Google / Microsoft send the user back here. The mailbox must be the user's own sign-in address,
 * so campaigns always go out from the address on their profile.
 */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (q: string) => NextResponse.redirect(new URL(`/account?${q}#mailbox`, req.url));
  const fail = (m: string) => back(`err=${encodeURIComponent(m)}`);
  const user = await getUser();
  if (!user) return NextResponse.redirect(new URL("/login", req.url));
  if (!can(user.role, "email.connect")) return NextResponse.redirect(new URL("/no-access?need=email.connect", req.url));
  if (provider !== "google" && provider !== "microsoft") return fail("Unknown mail provider.");
  const jar = await cookies();
  const expected = jar.get(MAILBOX_STATE_COOKIE)?.value;
  jar.delete({ name: MAILBOX_STATE_COOKIE, path: "/api/mailbox" });
  if (url.searchParams.get("error")) return fail(`Sign-in was cancelled (${url.searchParams.get("error_description") || url.searchParams.get("error")}).`);
  if (!expected || url.searchParams.get("state") !== expected) return fail("The sign-in expired. Please try again.");

  const isGoogle = provider === "google";
  const tokenUrl = isGoogle ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${microsoft.tenant()}/oauth2/v2.0/token`;
  const res = await fetch(tokenUrl, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: url.searchParams.get("code") ?? "",
      redirect_uri: mailboxCallbackUrl(req, provider),
      client_id: isGoogle ? google.clientId() : microsoft.clientId(),
      client_secret: isGoogle ? google.clientSecret() : microsoft.clientSecret(),
    }),
    cache: "no-store",
  }).catch(() => null);
  const tokens = (await res?.json().catch(() => null)) as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error_description?: string; error?: string } | null;
  if (!res?.ok || !tokens?.access_token) return fail(`Sign-in failed: ${tokens?.error_description || tokens?.error || "no answer"}`);
  if (!tokens.refresh_token) {
    return fail(isGoogle
      ? "Google did not give long-term access. Remove Kudu under your Google account's third-party access, then connect again."
      : "Microsoft did not give long-term access. Please connect again.");
  }

  let mailbox = "";
  if (isGoogle) {
    if (!tokens.scope?.split(" ").includes(google.scope)) return fail("Please tick \"Send email on your behalf\" when Google asks, then try again.");
    mailbox = String(tokens.id_token ? decodeJwt(tokens.id_token).email ?? "" : "");
  } else {
    const me = await fetch("https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store" })
      .then((r) => r.json() as Promise<{ mail?: string; userPrincipalName?: string }>)
      .catch(() => ({}) as { mail?: string; userPrincipalName?: string });
    mailbox = me.mail || me.userPrincipalName || "";
  }
  mailbox = mailbox.trim().toLowerCase();
  if (!mailbox) return fail("Could not read the mailbox's email address. Please try again.");
  if (mailbox !== user.email.toLowerCase()) {
    return fail(`You signed in as ${mailbox}, but your Kudu sign-in email is ${user.email}. Campaigns go out from your sign-in address, so connect that mailbox (or ask an admin to change your sign-in email first).`);
  }

  const db = await tenantDb();
  const p = isGoogle ? "GOOGLE" : "MICROSOFT";
  const data = { provider: p, email: mailbox, secret: encryptSecret(tokens.refresh_token), lastError: "", smtpHost: "", smtpUser: "" } as const;
  const existing = await db.mailAccount.findUnique({ where: { userId: user.id } });
  if (existing) forgetToken(existing.id);
  await db.mailAccount.upsert({
    where: { userId: user.id },
    update: { ...data, dailyLimit: Math.min(existing?.dailyLimit ?? 400, PROVIDER_DAILY_CAP[p]) },
    create: { ...data, userId: user.id, fromName: user.name, dailyLimit: isGoogle ? 400 : 250 },
  });
  return back(`msg=${encodeURIComponent(`Mailbox connected. Campaigns you send will come from ${mailbox}. Send yourself a test to check.`)}`);
}
