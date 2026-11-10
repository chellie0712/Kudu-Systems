import type { Invoice, Settings } from "@prisma/client";
import { can, type Access } from "./permissions";

export type ApprovalState = "NOT_NEEDED" | "NEEDED" | "REQUESTED" | "APPROVED";

type Approvable = Pick<Invoice, "total" | "approvedAt" | "approvalRequestedAt">;

/** Where a document stands with approval, when approval is `on` for totals of at least `threshold` cents. */
export function docApprovalState(doc: Approvable, on: boolean, threshold: number): ApprovalState {
  if (doc.approvedAt) return "APPROVED";
  if (!on || doc.total < threshold) return "NOT_NEEDED";
  return doc.approvalRequestedAt ? "REQUESTED" : "NEEDED";
}

/** Where an invoice stands with approval, given the company's approval settings. */
export function approvalState(inv: Approvable, settings: Pick<Settings, "invoiceApproval" | "invoiceApprovalThreshold">): ApprovalState {
  return docApprovalState(inv, settings.invoiceApproval, settings.invoiceApprovalThreshold);
}

export function quoteApprovalState(q: Approvable, settings: Pick<Settings, "quoteApproval" | "quoteApprovalThreshold">): ApprovalState {
  return docApprovalState(q, settings.quoteApproval, settings.quoteApprovalThreshold);
}

export function poApprovalState(po: Approvable, settings: Pick<Settings, "poApproval" | "poApprovalThreshold">): ApprovalState {
  return docApprovalState(po, settings.poApproval, settings.poApprovalThreshold);
}

/** A document may be marked as sent (or ordered) only when it needs no approval or has it. */
export const maySend = (s: ApprovalState) => s === "NOT_NEEDED" || s === "APPROVED";

/**
 * Whether `user` may approve their own expense claim or leave request. Only a built-in Admin may,
 * so a company with one admin still works; anyone else needs someone else to approve.
 */
export const mayDecideOwn = (user: { role: string; permissions?: readonly string[] | null }) => user.role === "ADMIN" && !user.permissions;

/** Whether a user may see an expense claim and its receipt: their own, or as an approver or bookkeeper. */
export const maySeeClaim = (user: { id: string } & Exclude<Access, string>, claimantId: string | null) =>
  claimantId === user.id || can(user, "expenses.approve") || can(user, "expenses.manage");
