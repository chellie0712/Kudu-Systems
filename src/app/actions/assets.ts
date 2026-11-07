"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { num, optDate, str } from "@/lib/form";
import { can, canAccessJobCard } from "@/lib/permissions";
import { ASSET_RESULTS } from "@/lib/assets";

const go = (path: string, kind: "msg" | "err", text: string, hash = ""): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}${hash}`);

const assetsTab = (customerId: string) => `/customers/${customerId}?tab=assets`;

/**
 * Adds or edits an asset. Office and admins do this from the customer's Assets tab. A technician
 * may add a new asset (not edit one) from a job card assigned to them, e.g. a station installed today.
 */
export async function saveAsset(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("assets.check");
  const id = str(fd, "id");
  const jobCardId = str(fd, "jobCardId");
  let customerId = str(fd, "customerId");
  let back = assetsTab(customerId);
  let hash = "";

  if (jobCardId) {
    const jc = await db.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, customerId: true, technicianId: true } });
    if (!jc) redirect("/job-cards");
    if (!canAccessJobCard(user, jc)) redirect("/no-access?need=jobcards.viewAll");
    customerId = jc.customerId;
    back = `/job-cards/${jc.id}`;
    hash = "#assets";
    if (id && !can(user.role, "assets.edit")) go(back, "err", "Ask the office to change an existing asset.", hash);
  } else if (!can(user.role, "assets.edit")) {
    redirect("/no-access?need=assets.edit");
  }

  const data = {
    code: str(fd, "code"),
    name: str(fd, "name"),
    location: str(fd, "location"),
    serialNumber: str(fd, "serialNumber"),
    installedAt: optDate(fd, "installedAt"),
    serviceMonths: Math.max(0, Math.round(num(fd, "serviceMonths", 0))),
    notes: str(fd, "notes"),
  };
  if (!data.name) go(back, "err", "The asset needs a name, e.g. Bait station.", hash);

  if (id) {
    const existing = await db.customerAsset.findUnique({ where: { id }, select: { customerId: true } });
    if (!existing || existing.customerId !== customerId) go(back, "err", "Asset not found.", hash);
    await db.customerAsset.update({ where: { id }, data: { ...data, active: fd.get("active") === "on" } });
  } else {
    await db.customerAsset.create({ data: { ...data, customerId } });
  }
  revalidatePath(back);
  go(back, "msg", id ? "Asset saved" : "Asset added", hash);
}

export async function deleteAsset(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("assets.delete");
  const asset = await db.customerAsset.findUnique({ where: { id: str(fd, "id") }, select: { id: true, customerId: true } });
  if (!asset) redirect("/customers");
  await db.customerAsset.delete({ where: { id: asset.id } });
  go(assetsTab(asset.customerId), "msg", "Asset and its service history deleted");
}

/** Saves the asset checks on a job card: one result (and optional note) per asset; an empty result removes the check. */
export async function saveAssetChecks(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("assets.check");
  const jobCardId = str(fd, "jobCardId");
  const jc = await db.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, customerId: true, technicianId: true } });
  if (!jc) redirect("/job-cards");
  if (!canAccessJobCard(user, jc)) redirect("/no-access?need=jobcards.viewAll");
  const path = `/job-cards/${jc.id}`;

  const assets = await db.customerAsset.findMany({ where: { customerId: jc.customerId }, select: { id: true } });
  const allowed: readonly string[] = ASSET_RESULTS;
  let saved = 0;
  await db.$transaction(async (tx) => {
    for (const a of assets) {
      if (!fd.has(`result_${a.id}`)) continue; // not on the form
      const result = str(fd, `result_${a.id}`);
      const note = str(fd, `note_${a.id}`);
      if (!result) {
        await tx.assetCheck.deleteMany({ where: { assetId: a.id, jobCardId: jc.id } });
        continue;
      }
      if (!allowed.includes(result)) continue;
      await tx.assetCheck.upsert({
        where: { assetId_jobCardId: { assetId: a.id, jobCardId: jc.id } },
        update: { result, note, userName: user.name },
        create: { assetId: a.id, jobCardId: jc.id, result, note, userName: user.name },
      });
      saved++;
    }
  });
  revalidatePath(path);
  go(path, "msg", `Asset checks saved (${saved})`, "#assets");
}
