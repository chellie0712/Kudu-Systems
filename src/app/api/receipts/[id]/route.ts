import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { maySeeClaim } from "@/lib/approval";

/** The receipt photo of an expense claim, for the claimant and approvers. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  const db = await tenantDb();
  const { id } = await params;
  const c = await db.expense.findUnique({ where: { id }, select: { receipt: true, claimantId: true } });
  if (!c?.receipt || !maySeeClaim(user, c.claimantId)) return new NextResponse("Not found", { status: 404 });
  const m = c.receipt.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new NextResponse("Bad image", { status: 500 });
  return new NextResponse(Buffer.from(m[2], "base64"), { headers: { "Content-Type": m[1], "Cache-Control": "private, no-store" } });
}
