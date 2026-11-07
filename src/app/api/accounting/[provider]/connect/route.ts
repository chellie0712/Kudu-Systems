import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { apiAdapter } from "@/lib/accounting";
import { STATE_COOKIE, redirectUri } from "@/lib/accounting/oauth";

/** Sends the company admin to Xero / QuickBooks / Zoho / FreshBooks to allow Kudu in. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings?${q}#accounting`, req.url));
  const user = await getUser();
  if (!user || !can(user.role, "settings.manage")) return NextResponse.redirect(new URL("/no-access?need=settings.manage", req.url));
  const a = apiAdapter(provider);
  if (!a || a.auth !== "oauth" || !a.authorizeUrl) return back(`err=${encodeURIComponent("That package doesn't connect this way.")}`);
  if (!a.configured()) return back(`err=${encodeURIComponent(`${a.name} is not set up on the server yet.`)}`);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, `${provider}.${state}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 900,
    path: "/api/accounting",
  });
  return NextResponse.redirect(a.authorizeUrl(state, redirectUri(req, provider)));
}
