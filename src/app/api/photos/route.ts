import { NextResponse } from "next/server";
import { PhotoKind } from "@prisma/client";
import { auth, authDisabled } from "@/auth";
import { db } from "@/lib/db";

const MAX_BYTES = 3 * 1024 * 1024;

/** Upload one compressed photo. Returns its id; the job card form attaches it on save. */
export async function POST(req: Request) {
  if (!authDisabled && !(await auth())?.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { dataUrl?: string; kind?: string } | null;
  const dataUrl = body?.dataUrl ?? "";
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return NextResponse.json({ error: "Not an image" }, { status: 400 });
  if (dataUrl.length > MAX_BYTES * 1.37) return NextResponse.json({ error: "Photo too large" }, { status: 413 });
  const kind = body?.kind && body.kind in PhotoKind ? (body.kind as PhotoKind) : PhotoKind.EXTRA;
  const photo = await db.jobCardPhoto.create({ data: { dataUrl, kind }, select: { id: true } });
  return NextResponse.json(photo);
}
