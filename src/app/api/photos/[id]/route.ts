import { NextResponse } from "next/server";
import { auth, authDisabled } from "@/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authDisabled && !(await auth())?.user) return new NextResponse("Not signed in", { status: 401 });
  const { id } = await params;
  const photo = await db.jobCardPhoto.findUnique({ where: { id } });
  if (!photo) return new NextResponse("Not found", { status: 404 });
  const m = photo.dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return new NextResponse("Bad image", { status: 500 });
  return new NextResponse(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
