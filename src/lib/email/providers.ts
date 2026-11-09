import nodemailer from "nodemailer";
import type { MailAccount, MailProvider } from "@prisma/client";
import { decryptSecret } from "@/lib/secret";

// Sending from a user's own mailbox. Three ways in, all sending the same MIME message:
//   GOOGLE     Gmail / Google Workspace via the Gmail API (OAuth, scope gmail.send)
//   MICROSOFT  Outlook.com / Microsoft 365 via Microsoft Graph (OAuth, Mail.Send)
//   SMTP       any other mailbox (e.g. the one that came with the website hosting)
// Mail sent this way sits in the user's own Sent folder, and replies come back to them.

export const PROVIDER_LABELS: Record<MailProvider, string> = {
  GOOGLE: "Gmail / Google Workspace",
  MICROSOFT: "Outlook / Microsoft 365",
  SMTP: "Other mailbox (SMTP)",
};

/** What each provider allows per day (approximate, from their published limits). */
export const PROVIDER_DAILY_CAP: Record<MailProvider, number> = {
  GOOGLE: 2000, // Google Workspace; a free @gmail.com account allows about 500
  MICROSOFT: 10000, // Microsoft 365 recipient limit; Outlook.com allows far fewer (about 300)
  SMTP: 5000, // depends entirely on the host
};

/** Pause between two emails, to stay under each provider's per-minute limits. */
export const PROVIDER_GAP_MS: Record<MailProvider, number> = {
  GOOGLE: 700,
  MICROSOFT: 2100, // Microsoft 365 allows 30 messages a minute
  SMTP: 1000,
};

export type MailErrorKind = "auth" | "limit" | "temporary" | "recipient" | "other";

export class MailError extends Error {
  constructor(message: string, public kind: MailErrorKind) {
    super(message);
  }
}

// ---------- OAuth apps (one per installation, set in Vercel) ----------

export const google = {
  clientId: () => process.env.GOOGLE_MAIL_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "",
  clientSecret: () => process.env.GOOGLE_MAIL_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "",
  scope: "https://www.googleapis.com/auth/gmail.send",
};

export const microsoft = {
  clientId: () => process.env.MICROSOFT_CLIENT_ID || "",
  clientSecret: () => process.env.MICROSOFT_CLIENT_SECRET || "",
  tenant: () => process.env.MICROSOFT_TENANT_ID || "common",
  scope: "offline_access openid email https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read",
};

export const providerConfigured = (p: MailProvider) =>
  p === "GOOGLE" ? Boolean(google.clientId() && google.clientSecret()) : p === "MICROSOFT" ? Boolean(microsoft.clientId() && microsoft.clientSecret()) : true;

/** Where Google / Microsoft send the user back to. Must be registered exactly on the OAuth app. */
export function mailboxCallbackUrl(req: Request, provider: "google" | "microsoft"): string {
  const base = (process.env.APP_URL || new URL(req.url).origin).replace(/\/$/, "");
  return `${base}/api/mailbox/${provider}/callback`;
}

export const MAILBOX_STATE_COOKIE = "kudu_mailbox_state";

// ---------- Access tokens ----------

const g = globalThis as unknown as { mailTokens?: Map<string, { token: string; expires: number }> };
const tokenCache = (g.mailTokens ??= new Map());

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };

async function refreshAccessToken(account: MailAccount, onRotate: (refreshToken: string) => Promise<void>): Promise<string> {
  const cached = tokenCache.get(account.id);
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const refresh = decryptSecret(account.secret);
  const isGoogle = account.provider === "GOOGLE";
  const url = isGoogle ? "https://oauth2.googleapis.com/token" : `https://login.microsoftonline.com/${microsoft.tenant()}/oauth2/v2.0/token`;
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh,
    client_id: isGoogle ? google.clientId() : microsoft.clientId(),
    client_secret: isGoogle ? google.clientSecret() : microsoft.clientSecret(),
    ...(isGoogle ? {} : { scope: microsoft.scope }),
  });
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body: form, cache: "no-store" });
  } catch (e) {
    throw new MailError(`Could not reach ${isGoogle ? "Google" : "Microsoft"}: ${e instanceof Error ? e.message : e}`, "temporary");
  }
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !body.access_token) {
    const why = body.error_description || body.error || `HTTP ${res.status}`;
    if (/invalid_client|unauthorized_client/.test(body.error ?? "")) {
      throw new MailError(`The server's ${isGoogle ? "Google" : "Microsoft"} app settings are wrong (${why}). Ask your administrator to check them.`, "auth");
    }
    throw new MailError(`Your mailbox connection has expired or was removed (${why}). Connect your mailbox again on My profile.`, "auth");
  }
  // Microsoft hands out a new refresh token each time; keep the newest one.
  if (body.refresh_token && body.refresh_token !== refresh) await onRotate(body.refresh_token);
  tokenCache.set(account.id, { token: body.access_token, expires: Date.now() + (body.expires_in ?? 3000) * 1000 });
  return body.access_token;
}

export function forgetToken(accountId: string) {
  tokenCache.delete(accountId);
}

// ---------- Sending ----------

async function sendGoogle(account: MailAccount, raw: string, onRotate: (t: string) => Promise<void>) {
  const token = await refreshAccessToken(account, onRotate);
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: Buffer.from(raw, "utf8").toString("base64url") }),
    cache: "no-store",
  }).catch((e) => {
    throw new MailError(`Could not reach Gmail: ${e instanceof Error ? e.message : e}`, "temporary");
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: { message?: string; errors?: { reason?: string }[] } } | null;
  const msg = body?.error?.message || `HTTP ${res.status}`;
  const reason = body?.error?.errors?.[0]?.reason ?? "";
  if (res.status === 401) { forgetToken(account.id); throw new MailError(`Gmail refused the sign-in (${msg}). Connect your mailbox again.`, "auth"); }
  if (res.status === 429 || /dailyLimitExceeded|userRateLimitExceeded|rateLimitExceeded|quotaExceeded/i.test(reason + msg)) {
    throw new MailError(`Gmail's sending limit was reached (${msg}). Sending continues tomorrow.`, "limit");
  }
  if (res.status === 403) throw new MailError(`Gmail refused to send (${msg}).`, "auth");
  if (res.status === 400) throw new MailError(`Gmail rejected this address (${msg}).`, "recipient");
  if (res.status >= 500) throw new MailError(`Gmail is having trouble (${msg}).`, "temporary");
  throw new MailError(`Gmail error: ${msg}`, "other");
}

async function sendMicrosoft(account: MailAccount, raw: string, onRotate: (t: string) => Promise<void>) {
  const token = await refreshAccessToken(account, onRotate);
  // Graph accepts the whole MIME message, base64-encoded, so our own headers go out as-is.
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: Buffer.from(raw, "utf8").toString("base64"),
    cache: "no-store",
  }).catch((e) => {
    throw new MailError(`Could not reach Microsoft: ${e instanceof Error ? e.message : e}`, "temporary");
  });
  if (res.ok) return;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  const code = body?.error?.code ?? "";
  const msg = body?.error?.message || code || `HTTP ${res.status}`;
  if (res.status === 401) { forgetToken(account.id); throw new MailError(`Microsoft refused the sign-in (${msg}). Connect your mailbox again.`, "auth"); }
  if (res.status === 429 || /ExceededMessageLimit|QuotaExceeded|MailboxConcurrency|Throttl/i.test(code + msg)) {
    throw new MailError(`Microsoft's sending limit was reached (${msg}). Sending continues later.`, "limit");
  }
  if (res.status === 403) throw new MailError(`Microsoft refused to send (${msg}).`, "auth");
  if (/InvalidRecipients|InvalidInternetMessageHeader/i.test(code)) throw new MailError(`Microsoft rejected this address (${msg}).`, "recipient");
  if (res.status >= 500) throw new MailError(`Microsoft is having trouble (${msg}).`, "temporary");
  throw new MailError(`Microsoft error: ${msg}`, "other");
}

export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; password: string };

export function smtpTransport(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.secure,
    auth: { user: s.user, pass: s.password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

/** Turns nodemailer's error into a plain sentence and a kind. */
export function smtpError(e: unknown): MailError {
  const err = e as { code?: string; responseCode?: number; response?: string; message?: string };
  const detail = err.response || err.message || String(e);
  if (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534) {
    return new MailError(`The mail server did not accept the username or password (${detail}). Check the password, or use an app password if the mailbox has 2-step verification.`, "auth");
  }
  if (["ECONNECTION", "ETIMEDOUT", "ESOCKET", "EDNS", "ECONNREFUSED"].includes(err.code ?? "")) {
    return new MailError(`Could not connect to the mail server (${detail}). Check the server name, port and security setting.`, "temporary");
  }
  const rc = err.responseCode ?? 0;
  if (rc === 421 || rc === 450 || rc === 451 || rc === 452) return new MailError(`The mail server asked to try later (${detail}).`, /quota|limit|too many|rate/i.test(detail) ? "limit" : "temporary");
  if (/quota|limit exceeded|too many|rate limit/i.test(detail)) return new MailError(`The mail server's sending limit was reached (${detail}).`, "limit");
  if (rc >= 550 && rc <= 553) return new MailError(`The mail server rejected this address (${detail}).`, "recipient");
  return new MailError(`Mail server error: ${detail}`, "other");
}

async function sendSmtp(account: MailAccount, raw: string, to: string) {
  const transport = smtpTransport({
    host: account.smtpHost,
    port: account.smtpPort,
    secure: account.smtpSecure,
    user: account.smtpUser || account.email,
    password: decryptSecret(account.secret),
  });
  try {
    await transport.sendMail({ envelope: { from: account.email, to }, raw });
  } catch (e) {
    throw smtpError(e);
  } finally {
    transport.close();
  }
}

/** Sends one complete MIME message from the account. Throws MailError. */
export async function sendRaw(account: MailAccount, raw: string, to: string, onRotate: (refreshToken: string) => Promise<void>): Promise<void> {
  if (account.provider === "GOOGLE") return sendGoogle(account, raw, onRotate);
  if (account.provider === "MICROSOFT") return sendMicrosoft(account, raw, onRotate);
  return sendSmtp(account, raw, to);
}
