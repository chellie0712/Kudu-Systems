import { NextResponse } from "next/server";
import { offlineAccess } from "@/lib/offlineServer";
import { MAX_EXTRA_PHOTOS } from "@/lib/jobcard";

const MAX_BYTES = 3 * 1024 * 1024;

/**
 * One photo taken offline. The phone picks the photo's id, so sending it twice (e.g. the
 * connection dropped before the answer arrived) stores it once.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { jobId?: string; id?: string; kind?: string; dataUrl?: string } | null;
  const id = body?.id ?? "";
  const dataUrl = body?.dataUrl ?? "";
  const kind = body?.kind === "BEFORE" || body?.kind === "AFTER" ? body.kind : "EXTRA";
  if (!/^off_[A-Za-z0-9_-]{16,40}$/.test(id)) return NextResponse.json({ error: "Bad photo id" }, { status: 400 });
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl)) return NextResponse.json({ error: "Not an image" }, { status: 400 });
  if (dataUrl.length > MAX_BYTES * 1.37) return NextResponse.json({ error: "Photo too large" }, { status: 413 });
  const access = await offlineAccess(body?.jobId ?? "");
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });
  const { db, jc } = access;

  const existing = await db.jobCardPhoto.findUnique({ where: { id }, select: { jobCardId: true } });
  if (existing) {
    return existing.jobCardId === jc.id ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Photo id in use" }, { status: 409 });
  }
  if (kind === "EXTRA" && (await db.jobCardPhoto.count({ where: { jobCardId: jc.id, kind: "EXTRA" } })) >= MAX_EXTRA_PHOTOS) {
    return NextResponse.json({ ok: true, skipped: `Only ${MAX_EXTRA_PHOTOS} extra photos fit on a job card; this one was not added.` });
  }
  // A new before/after photo replaces the old one, as on the job card form.
  await db.$transaction([
    ...(kind !== "EXTRA" ? [db.jobCardPhoto.deleteMany({ where: { jobCardId: jc.id, kind } })] : []),
    db.jobCardPhoto.create({ data: { id, jobCardId: jc.id, kind, dataUrl, sortOrder: kind === "EXTRA" ? 100 : 0 } }),
  ]);
  return NextResponse.json({ ok: true });
}
