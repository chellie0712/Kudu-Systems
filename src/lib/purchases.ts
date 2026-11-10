import type { PoStatus } from "@prisma/client";

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  DRAFT: "Draft",
  AWAITING_APPROVAL: "Waiting for approval",
  APPROVED: "Approved",
  ORDERED: "Ordered",
  PARTLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  CANCELLED: "Cancelled",
};
export const PO_STATUS_COLOURS: Record<PoStatus, string> = {
  DRAFT: "bg-charcoal-100 text-charcoal-600",
  AWAITING_APPROVAL: "bg-amber-100 text-amber-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  ORDERED: "bg-sky-100 text-sky-800",
  PARTLY_RECEIVED: "bg-amber-100 text-amber-800",
  RECEIVED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-charcoal-100 text-charcoal-500 line-through",
};
/** Before it is ordered, a purchase order can still be changed. */
export const PO_EDITABLE: PoStatus[] = ["DRAFT", "AWAITING_APPROVAL", "APPROVED"];
export const PO_RECEIVABLE: PoStatus[] = ["ORDERED", "PARTLY_RECEIVED"];
