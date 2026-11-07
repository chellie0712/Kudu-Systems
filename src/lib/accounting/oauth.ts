/** Where the package sends the admin back to. Must be registered exactly on the package's app. */
export function redirectUri(req: Request, provider: string): string {
  const base = (process.env.ACCOUNTING_REDIRECT_BASE || new URL(req.url).origin).replace(/\/$/, "");
  return `${base}/api/accounting/${provider}/callback`;
}

export const STATE_COOKIE = "kudu_acct_state";
