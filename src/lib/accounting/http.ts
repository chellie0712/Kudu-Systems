import { AccountingError, type Ctx } from "./types";

/** Pulls a readable sentence out of the many error shapes the packages return. */
export function errorText(body: unknown, status: number): string {
  if (typeof body === "string" && body.trim()) return body.trim().slice(0, 300);
  const b = (body ?? {}) as Record<string, unknown>;
  const pick = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
  // Xero: { Elements: [{ ValidationErrors: [{ Message }] }], Message }
  const xero = (b.Elements as { ValidationErrors?: { Message?: string }[] }[] | undefined)
    ?.flatMap((e) => e.ValidationErrors ?? [])
    .map((e) => e.Message)
    .filter(Boolean)
    .join(" ");
  // QuickBooks: { Fault: { Error: [{ Message, Detail }] } }
  const qbo = (b.Fault as { Error?: { Message?: string; Detail?: string }[] } | undefined)?.Error?.map((e) => e.Detail || e.Message).join(" ");
  // FreshBooks: { response: { errors: [{ message }] } }
  const fb = ((b.response as { errors?: { message?: string }[] } | undefined)?.errors ?? []).map((e) => e.message).join(" ");
  // Sage SA: { ModelState: {...}, Message }
  const model = b.ModelState ? Object.values(b.ModelState as Record<string, string[]>).flat().join(" ") : "";
  // Odoo JSON-2: { name, message }; JSON-RPC: { error: { data: { message } } }
  const odoo = pick((b.error as { data?: { message?: string } } | undefined)?.data?.message);
  return (
    xero || qbo || fb || model || odoo ||
    pick(b.Detail) || pick(b.message) || pick(b.Message) || pick(b.error_description) || pick(b.ExceptionMessage) ||
    pick(b.error) || `HTTP ${status}`
  ).slice(0, 300);
}

/** fetch + JSON + one readable error. `who` names the package in messages. */
export async function call<T>(
  who: string,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: unknown; form?: Record<string, string> } = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json", ...(init.headers ?? {}) };
  let body: string | undefined;
  if (init.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(init.form).toString();
  } else if (init.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.body);
  }
  let res: Response;
  try {
    res = await fetch(url, { method: init.method ?? (body ? "POST" : "GET"), headers, body, cache: "no-store", signal: AbortSignal.timeout(30000) });
  } catch (e) {
    throw new AccountingError(`Could not reach ${who} (${e instanceof Error ? e.message : e}).`);
  }
  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // plain text or HTML error page
  }
  if (res.status === 401) throw new AccountingError(`${who} refused the sign-in (${errorText(parsed, 401)}). Connect ${who} again in Settings → Accounting.`);
  if (res.status === 429) throw new AccountingError(`${who}'s request limit was reached. Kudu will try again later.`);
  if (!res.ok) throw new AccountingError(`${who}: ${errorText(parsed, res.status)}`);
  return parsed as T;
}

/** Splits a free-text address into lines (Kudu stores one text box). */
export function addressLines(text: string, max = 4): string[] {
  const lines = text.split(/\r?\n|,\s*/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > max) lines.splice(max - 1, lines.length - max + 1, lines.slice(max - 1).join(", "));
  return lines;
}

/** "Jane Smith" -> ["Jane", "Smith"] */
export function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return [parts[0] ?? "", ""];
  return [parts.slice(0, -1).join(" "), parts[parts.length - 1]];
}

export const rands = (cents: number) => Math.round(cents) / 100;
export const toCents = (v: unknown) => Math.round(Number(v ?? 0) * 100);
export const day = (d: Date) => {
  // Calendar day in South Africa (invoice dates are stored at local midnight).
  const tz = process.env.APP_TIMEZONE || "Africa/Johannesburg";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

type TokenSet = { access_token: string; refresh_token?: string; expires_in?: number | string };

/**
 * Returns a live OAuth access token, refreshing it (and saving the new refresh token, which
 * Xero, QuickBooks and FreshBooks replace on every refresh) when it has expired.
 */
export async function accessToken(ctx: Ctx, who: string, refresh: (refreshToken: string) => Promise<TokenSet>): Promise<string> {
  const c = ctx.link.credentials;
  if (c.access_token && Number(c.expires_at ?? 0) > Date.now() + 60_000) return c.access_token;
  if (!c.refresh_token) throw new AccountingError(`${who} is not connected. Connect it in Settings → Accounting.`);
  let t: TokenSet;
  try {
    t = await refresh(c.refresh_token);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    throw new AccountingError(`${who} would not renew Kudu's access (${why}). Connect ${who} again in Settings → Accounting.`);
  }
  const next: Record<string, string> = { ...c, ...tokenFields(t), refresh_token: t.refresh_token || c.refresh_token };
  await ctx.saveCredentials(next);
  ctx.link.credentials = next;
  return next.access_token;
}

export function tokenFields(t: TokenSet): Record<string, string> {
  const out: Record<string, string> = { access_token: t.access_token, expires_at: String(Date.now() + Number(t.expires_in ?? 1800) * 1000) };
  if (t.refresh_token) out.refresh_token = t.refresh_token;
  return out;
}

export const basic = (id: string, secret: string) => `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;

/** Two-decimal percentage; used where a package takes the discount as a %. */
export const pct = (n: number) => Math.round(n * 10000) / 10000;

