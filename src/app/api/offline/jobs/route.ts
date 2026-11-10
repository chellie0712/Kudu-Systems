import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { parseItems } from "@/lib/checklists";
import { lines } from "@/lib/jobcard";
import type { OfflinePack } from "@/lib/offline";

/** The signed-in user's open jobs, for the phone to keep for use without signal. */
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(user, "jobcards.edit")) return NextResponse.json({ error: "No access" }, { status: 403 });
  const db = await tenantDb();
  const settings = await getSettings();
  const jobs = await db.jobCard.findMany({
    where: { technicianId: user.id, status: { in: ["SCHEDULED", "IN_PROGRESS"] } },
    include: {
      customer: { select: { name: true } },
      checklists: { orderBy: { sortOrder: "asc" } },
      photos: { select: { kind: true } },
    },
    orderBy: [{ scheduledStart: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: 50,
  });
  const pack: OfflinePack = {
    userId: user.id,
    userName: user.name,
    companyName: settings.companyName,
    warrantyTerms: lines(settings.warrantyTerms),
    downloadedAt: new Date().toISOString(),
    jobs: jobs.map((j) => ({
      id: j.id,
      number: j.number,
      status: j.status,
      customerName: j.customer.name,
      siteAddress: j.siteAddress,
      siteContact: j.siteContact,
      contactNumber: j.contactNumber,
      scheduledStart: j.scheduledStart?.toISOString() ?? null,
      jobType: j.jobType,
      scopeOfWork: j.scopeOfWork,
      areaTreated: j.areaTreated,
      workDescription: j.workDescription,
      warrantyComments: j.warrantyComments,
      checklists: j.checklists.map((l) => ({ id: l.id, name: l.name, requiredForCompletion: l.requiredForCompletion, items: parseItems(l.items) })),
      photoCounts: {
        BEFORE: j.photos.filter((p) => p.kind === "BEFORE").length,
        AFTER: j.photos.filter((p) => p.kind === "AFTER").length,
        EXTRA: j.photos.filter((p) => p.kind === "EXTRA").length,
      },
    })),
  };
  return NextResponse.json(pack, { headers: { "Cache-Control": "no-store" } });
}
