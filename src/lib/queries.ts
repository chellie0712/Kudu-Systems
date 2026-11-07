import type { QueryPriority, QueryStatus } from "@prisma/client";

export const QUERY_STATUS_LABELS: Record<QueryStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  WAITING_ON_CUSTOMER: "Waiting on customer",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export const QUERY_STATUS_COLOURS: Record<QueryStatus, string> = {
  OPEN: "bg-sky-100 text-sky-800",
  IN_PROGRESS: "bg-amber-100 text-amber-800",
  WAITING_ON_CUSTOMER: "bg-violet-100 text-violet-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-charcoal-100 text-charcoal-600",
};

export const OPEN_STATUSES: QueryStatus[] = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"];
export const isOpen = (s: QueryStatus) => OPEN_STATUSES.includes(s);

export const PRIORITY_LABELS: Record<QueryPriority, string> = { LOW: "Low", NORMAL: "Normal", HIGH: "High", URGENT: "Urgent" };
export const PRIORITY_COLOURS: Record<QueryPriority, string> = {
  LOW: "text-charcoal-500",
  NORMAL: "text-charcoal-700",
  HIGH: "font-semibold text-amber-700",
  URGENT: "font-bold text-kudu-700",
};

/** Suggestions; any text is allowed. */
export const QUERY_CATEGORIES = ["Complaint", "Re-service request", "Callback", "Billing / invoice", "Quotation request", "Booking change", "General enquiry"];
export const QUERY_SOURCES = ["Phone", "Email", "WhatsApp", "Walk-in", "Website", "Technician"];

/** The due date is a day; a query is overdue once that whole day has passed. */
export const overdueBefore = (now = new Date()) => new Date(now.getTime() - 24 * 60 * 60 * 1000);
export const isOverdue = (q: { status: QueryStatus; dueAt: Date | null }, now = new Date()) => isOpen(q.status) && !!q.dueAt && q.dueAt < overdueBefore(now);
