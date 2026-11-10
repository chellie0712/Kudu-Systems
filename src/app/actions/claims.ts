"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission, type AppUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { mayDecideOwn } from "@/lib/approval";
import { str } from "@/lib/form";
import { fromLocalInput, toCents } from "@/lib/format";
import { getSettings } from "@/lib/settings";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const backTo = (fd: FormData, fallback: string) => {
  const b = str(fd, "returnTo");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
};

const MAX_RECEIPT = 3_000_000; // characters of data URL (about 2.2 MB of image)

/** A receipt photo from the form: a JPEG/PNG data URL made by the browser, or null. */
function receiptFrom(fd: FormData): string | null | "invalid" {
  const v = str(fd, "receipt");
  if (!v) return null;
  if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > MAX_RECEIPT) return "invalid";
  return v;
}

/** A claim a user may decide on: someone else's, or their own when they are an admin. */
async function decidable(user: AppUser, id: string) {
  const db = await tenantDb();
  const c = await db.expense.findUnique({ where: { id } });
  if (!c || !c.claimantId) go("/approvals", "err", "Claim not found");
  if (c!.claimantId === user.id && !mayDecideOwn(user)) go("/approvals", "err", "Someone else has to approve your own claim.");
  return c!;
}

/** Submit a new claim or change and resubmit your own claim that is waiting or was rejected. */
export async function submitClaim(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("expenses.claim");
  const settings = await getSettings();
  const id = str(fd, "id");
  const back = "/claims";
  const date = fromLocalInput(str(fd, "date"));
  const category = str(fd, "category").slice(0, 80);
  const totalPaid = Math.max(0, toCents(str(fd, "totalPaid")));
  const hasVat = fd.get("hasVat") === "on";
  if (!date || !category || !totalPaid) go(back, "err", "A claim needs a date, a category and the amount you paid.");
  const receipt = receiptFrom(fd);
  if (receipt === "invalid") go(back, "err", "The receipt photo could not be read. Try a smaller photo.");
  const before = id ? await db.expense.findUnique({ where: { id } }) : null;
  if (id && (!before || before.claimantId !== user.id || !["SUBMITTED", "REJECTED"].includes(before.status))) go(back, "err", "You can only change your own claims that are not approved yet.");
  // Approved claims count in the P&L excl. VAT, like other expenses.
  const amount = hasVat ? Math.round((totalPaid * 100) / (100 + settings.vatRate)) : totalPaid;
  const auto = settings.claimAutoApprove > 0 && totalPaid < settings.claimAutoApprove;
  const data = {
    date: date!,
    category,
    description: str(fd, "description").slice(0, 500),
    supplier: str(fd, "supplier").slice(0, 120),
    amount,
    totalPaid,
    // Keep the old slip unless a new one is given or it is removed.
    ...(receipt || fd.get("removeReceipt") === "on" ? { receipt } : {}),
    status: auto ? ("APPROVED" as const) : ("SUBMITTED" as const),
    submittedAt: new Date(),
    decidedAt: auto ? new Date() : null,
    decidedBy: auto ? "Automatically (under the limit)" : "",
    decisionNote: "",
  };
  if (before) await db.expense.update({ where: { id: before.id }, data });
  else await db.expense.create({ data: { ...data, claimantId: user.id, claimantName: user.name, createdBy: user.name } });
  revalidatePath("/claims");
  go(back, "msg", auto ? "Claim approved automatically (under the limit)." : "Claim submitted for approval.");
}

/** Withdraw your own claim before it is approved. */
export async function withdrawClaim(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("expenses.claim");
  const done = await db.expense.deleteMany({ where: { id: str(fd, "id"), claimantId: user.id, status: { in: ["SUBMITTED", "REJECTED"] } } });
  go("/claims", done.count ? "msg" : "err", done.count ? "Claim withdrawn." : "Only claims that are not approved yet can be withdrawn.");
}

export async function approveClaim(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("expenses.approve");
  const c = await decidable(user, str(fd, "id"));
  await db.expense.updateMany({ where: { id: c.id, status: { in: ["SUBMITTED", "REJECTED"] } }, data: { status: "APPROVED", decidedAt: new Date(), decidedBy: user.name, decisionNote: "" } });
  revalidatePath("/claims");
  go(backTo(fd, "/approvals"), "msg", `Claim by ${c.claimantName} approved`);
}

export async function rejectClaim(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("expenses.approve");
  const c = await decidable(user, str(fd, "id"));
  const note = str(fd, "note").slice(0, 500);
  if (!note) go(backTo(fd, "/approvals"), "err", "Say why the claim is rejected.");
  await db.expense.updateMany({ where: { id: c.id, status: "SUBMITTED" }, data: { status: "REJECTED", decidedAt: new Date(), decidedBy: user.name, decisionNote: note } });
  revalidatePath("/claims");
  go(backTo(fd, "/approvals"), "msg", `Claim by ${c.claimantName} rejected`);
}

/** Record that an approved claim was paid back to the person (or undo that). */
export async function setClaimReimbursed(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("expenses.approve");
  const paid = str(fd, "paid") === "1";
  await db.expense.updateMany({
    where: { id: str(fd, "id"), status: "APPROVED", claimantId: { not: null } },
    data: paid ? { reimbursedAt: new Date(), reimbursedBy: user.name } : { reimbursedAt: null, reimbursedBy: "" },
  });
  revalidatePath("/claims");
  go(backTo(fd, "/claims?view=all"), "msg", paid ? "Marked as paid back" : "Marked as not paid back");
}
