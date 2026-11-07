/** Results a technician can record for an asset on a job card. */
export const ASSET_RESULTS = [
  "Checked, OK",
  "Activity found",
  "Bait / glue board replaced",
  "Serviced",
  "Repaired",
  "Replaced",
  "Damaged",
  "Missing",
  "Not accessible",
] as const;

/** Results that need the office's attention; shown in red. */
export const ASSET_ALERTS: readonly string[] = ["Activity found", "Damaged", "Missing", "Not accessible"];

/** When the asset is next due for a service, from its last check (or install date) and interval. */
export function nextServiceDue(asset: { serviceMonths: number; installedAt: Date | null }, lastChecked: Date | null): Date | null {
  if (!asset.serviceMonths) return null;
  const from = lastChecked ?? asset.installedAt;
  if (!from) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + asset.serviceMonths);
  return d;
}
