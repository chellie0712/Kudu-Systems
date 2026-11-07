import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { apiAdapter } from "@/lib/accounting";
import { STATE_COOKIE, redirectUri } from "@/lib/accounting/oauth";
import { loadLink, saveLink } from "@/lib/accounting/store";
import { AccountingError } from "@/lib/accounting/types";

/** The package sends the admin back here; tokens are kept, encrypted, in this company's database. */
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const back = (key: "msg" | "err", text: string) => NextResponse.redirect(new URL(`/settings?${key}=${encodeURIComponent(text)}#accounting`, req.url));
  const user = await getUser();
  if (!user || !can(user.role, "settings.manage")) return NextResponse.redirect(new URL("/no-access?need=settings.manage", req.url));
  const a = apiAdapter(provider);
  if (!a || !a.exchangeCode) return back("err", "Unknown accounting package.");
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/accounting" });
  const error = url.searchParams.get("error");
  if (error) return back("err", `${a.name} sign-in was cancelled (${url.searchParams.get("error_description") || error}).`);
  if (!expected || expected !== `${provider}.${url.searchParams.get("state")}`) return back("err", `The ${a.name} sign-in expired. Please try again.`);

  const db = await tenantDb();
  try {
    const r = await a.exchangeCode(url.searchParams, redirectUri(req, provider));
    const before = await loadLink(db, a.id);
    const orgChanged = r.orgId !== undefined && before?.orgId && before.orgId !== r.orgId;
    await saveLink(db, a.id, {
      credentials: r.credentials,
      ...(r.orgId !== undefined ? { orgId: r.orgId, orgName: r.orgName ?? "" } : {}),
      ...(orgChanged ? { config: {} } : {}),
    });
    await db.settings.update({ where: { id: 1 }, data: { accountingProvider: a.id, acctLastError: "" } });
    return back("msg", `${a.name} connected${r.orgName ? ` (${r.orgName})` : ""}. Now check the choices below and save.`);
  } catch (e) {
    return back("err", `${a.name} sign-in failed: ${e instanceof AccountingError || e instanceof Error ? e.message : String(e)}`);
  }
}
