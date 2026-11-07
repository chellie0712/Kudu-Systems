import type { Invoice, Settings } from "@prisma/client";

export type ApprovalState = "NOT_NEEDED" | "NEEDED" | "REQUESTED" | "APPROVED";

/** Where an invoice stands with approval, given the company's approval settings. */
export function approvalState(
  inv: Pick<Invoice, "total" | "approvedAt" | "approvalRequestedAt">,
  settings: Pick<Settings, "invoiceApproval" | "invoiceApprovalThreshold">,
): ApprovalState {
  if (inv.approvedAt) return "APPROVED";
  if (!settings.invoiceApproval || inv.total < settings.invoiceApprovalThreshold) return "NOT_NEEDED";
  return inv.approvalRequestedAt ? "REQUESTED" : "NEEDED";
}

/** An invoice may be marked as sent only when it needs no approval or has it. */
export const maySend = (s: ApprovalState) => s === "NOT_NEEDED" || s === "APPROVED";
