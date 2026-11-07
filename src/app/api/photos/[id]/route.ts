import { NextResponse } from "next/server";
import { getPortalUser, getUser } from "@/auth";
import { tenantDb } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const staff = await getUser();
  // Customer portal users may only see photos on their own job cards.
  const customer = staff ? null : await getPortalUser();
  if (!staff && !customer) return new NextResponse("Not signed in", { status: 401 });
  const db = await tenantDb();
  const { id } = await params;
  const photo = await db.jobCardPhoto.findUnique({ where: { id }, include: { jobCard: { select: { customerId: true } } } });
  if (!photo || (customer && photo.jobCard?.customerId !== customer.customerId)) return new NextResponse("Not found", { status: 404 });
  const m = photo.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new NextResponse("Bad image", { status: 500 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
