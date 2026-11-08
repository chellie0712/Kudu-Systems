const colours: Record<string, string> = {
  DRAFT: "bg-charcoal-100 text-charcoal-600",
  SENDING: "bg-amber-100 text-amber-800",
  PAUSED: "bg-kudu-100 text-kudu-700",
  SENT: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-charcoal-100 text-charcoal-500 line-through",
  QUEUED: "bg-charcoal-100 text-charcoal-600",
  FAILED: "bg-kudu-600 text-white",
  SKIPPED: "bg-charcoal-100 text-charcoal-500",
};

export function CampaignStatusBadge({ status }: { status: string }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${colours[status] ?? "bg-charcoal-100"}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}
