import { NextResponse } from "next/server";
import { getCompany } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { readUnsubscribeToken } from "@/lib/email/links";
import { unsubscribeRecipient } from "@/lib/email/unsubscribe";

type Params = { params: Promise<{ company: string; token: string }> };

/** One-click unsubscribe (RFC 8058): Gmail, Yahoo and Apple Mail POST here from their own button. */
export async function POST(_req: Request, { params }: Params) {
  const { company: id, token } = await params;
  const company = await getCompany(id);
  const recipientId = company ? readUnsubscribeToken(company.id, token) : null;
  if (!company || !recipientId) return new NextResponse("Invalid link", { status: 404 });
  await unsubscribeRecipient(clientForCompany(company), recipientId, "One-click unsubscribe from the mail app");
  return new NextResponse("Unsubscribed", { status: 200 });
}

/** Someone opening the address in a browser gets the normal unsubscribe page. */
export async function GET(req: Request, { params }: Params) {
  const { company, token } = await params;
  return NextResponse.redirect(new URL(`/unsubscribe/${encodeURIComponent(company)}/${encodeURIComponent(token)}`, req.url));
}
