import { NextResponse } from "next/server";
import { tenantDb } from "@/lib/db";
import { dayKey } from "@/lib/format";
import { amount, csvContext, csvResponse } from "@/lib/reportsCsv";

/** Invoices issued in the period (drafts and cancelled left out). */
export async function GET(req: Request) {
  const ctx = await csvContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { period, ofBranch } = ctx;
  const db = await tenantDb();
  const rows = await db.invoice.findMany({
    where: { issueDate: { gte: period.from, lt: period.to }, status: { notIn: ["DRAFT", "CANCELLED"] }, ...ofBranch },
    include: { customer: { select: { name: true, vatNumber: true, branch: { select: { name: true } } } } },
    orderBy: { issueDate: "asc" },
  });
  return csvResponse(
    `invoices_${period.fromInput}_${period.toInput}.csv`,
    ["Number", "Issue date", "Due date", "Customer", "Customer VAT no.", "Branch", "Reference", "Status", "Excl. VAT", "VAT", "Total", "Paid", "Balance"],
    rows.map((i) => [
      i.number,
      dayKey(i.issueDate),
      dayKey(i.dueDate),
      i.customer.name,
      i.customer.vatNumber,
      i.customer.branch?.name ?? "",
      i.reference,
      i.status,
      amount(i.total - i.vatAmount),
      amount(i.vatAmount),
      amount(i.total),
      amount(i.amountPaid),
      amount(i.total - i.amountPaid),
    ]),
  );
}
