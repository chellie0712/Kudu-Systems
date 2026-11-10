"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { LeaveType } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { mayDecideOwn } from "@/lib/approval";
import { str } from "@/lib/form";
import { dayKey } from "@/lib/format";
import { dateOnly, workingDays } from "@/lib/leave";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const backTo = (fd: FormData, fallback: string) => {
  const b = str(fd, "returnTo");
  return b.startsWith("/") && !b.startsWith("//") ? b : fallback;
};

/**
 * Request leave. Someone who approves leave may also record it for another person (e.g. a sick
 * day phoned in), which is approved straight away.
 */
export async function requestLeave(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("leave.request");
  const back = "/leave";
  const start = dateOnly(str(fd, "startDate"));
  let end = dateOnly(str(fd, "endDate")) ?? start;
  if (!start || !end) return go(back, "err", "Choose the first and last day.");
  if (end < start) end = start;
  const halfDay = fd.get("halfDay") === "on" && start.getTime() === end.getTime();
  const type = str(fd, "type") in LeaveType ? (str(fd, "type") as LeaveType) : LeaveType.ANNUAL;
  const forId = str(fd, "userId");
  const forOther = !!forId && forId !== user.id;
  if (forOther && !can(user, "leave.approve")) go(back, "err", "You can only request leave for yourself.");
  const person = forOther ? await db.user.findFirst({ where: { id: forId, disabled: false }, select: { id: true, name: true, email: true } }) : null;
  if (forOther && !person) go(back, "err", "That person was not found.");
  const days = halfDay ? 0.5 : workingDays(start, end);
  if (days <= 0) go(back, "err", "Those days are all weekends or public holidays.");
  const overlap = await db.leaveRequest.findFirst({
    where: { userId: person?.id ?? user.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: end }, endDate: { gte: start } },
  });
  if (overlap) go(back, "err", "There is already leave booked on some of those days.");
  await db.leaveRequest.create({
    data: {
      userId: person?.id ?? user.id,
      type,
      startDate: start,
      endDate: end,
      halfDay,
      days,
      reason: str(fd, "reason").slice(0, 1000),
      ...(forOther ? { status: "APPROVED" as const, decidedAt: new Date(), decidedBy: user.name, decisionNote: `Recorded by ${user.name}` } : {}),
    },
  });
  revalidatePath("/leave");
  go(back, "msg", forOther ? `Leave recorded for ${person!.name || person!.email}` : "Leave requested. You'll see here when it is approved.");
}

/** Cancel your own leave: a request still waiting, or approved leave that has not started. */
export async function cancelLeave(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("leave.request");
  const l = await db.leaveRequest.findUnique({ where: { id: str(fd, "id") } });
  const today = dateOnly(dayKey(new Date()))!;
  const own = l?.userId === user.id;
  const approver = can(user, "leave.approve");
  if (!l || (!own && !approver)) return go("/leave", "err", "Leave not found");
  if (!(l.status === "PENDING" || (l.status === "APPROVED" && (approver || l.startDate > today)))) go("/leave", "err", "This leave can't be cancelled any more. Ask your manager.");
  await db.leaveRequest.update({ where: { id: l.id }, data: { status: "CANCELLED", ...(own ? {} : { decidedBy: user.name, decidedAt: new Date() }) } });
  revalidatePath("/leave");
  go(backTo(fd, "/leave"), "msg", "Leave cancelled");
}

async function decide(fd: FormData, approve: boolean) {
  const db = await tenantDb();
  const user = await requirePermission("leave.approve");
  const back = backTo(fd, "/approvals");
  const l = await db.leaveRequest.findUnique({ where: { id: str(fd, "id") }, include: { user: { select: { name: true, email: true } } } });
  if (!l) return go(back, "err", "Leave request not found");
  if (l.userId === user.id && !mayDecideOwn(user)) go(back, "err", "Someone else has to approve your own leave.");
  const note = str(fd, "note").slice(0, 500);
  if (!approve && !note) go(back, "err", "Say why the leave is declined.");
  const done = await db.leaveRequest.updateMany({
    where: { id: l.id, status: "PENDING" },
    data: { status: approve ? "APPROVED" : "DECLINED", decidedAt: new Date(), decidedBy: user.name, decisionNote: note },
  });
  revalidatePath("/leave");
  const who = l.user.name || l.user.email;
  go(back, done.count ? "msg" : "err", done.count ? `Leave for ${who} ${approve ? "approved" : "declined"}` : "It was already decided.");
}

export async function approveLeave(fd: FormData) {
  await decide(fd, true);
}

export async function declineLeave(fd: FormData) {
  await decide(fd, false);
}
