import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { currentBranchId } from "@/lib/branch";
import { csv, periodFrom, type Period } from "@/lib/reports";

/** Checks access and works out the period and branch filter for a CSV export. */
export async function csvContext(req: Request): Promise<NextResponse | { period: Period; ofBranch: { customer?: { branchId: string } } }> {
  const user = await getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!can(user.role, "reports.view")) return new NextResponse("No access", { status: 403 });
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  const branchId = await currentBranchId();
  return { period: periodFrom(sp), ofBranch: branchId ? { customer: { branchId } } : {} };
}

/** Rows to a downloadable CSV (with a BOM so Excel reads the characters correctly). */
export function csvResponse(name: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const body = "﻿" + [header, ...rows].map((r) => r.map(csv).join(",")).join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}

export const amount = (cents: number) => (cents / 100).toFixed(2);
