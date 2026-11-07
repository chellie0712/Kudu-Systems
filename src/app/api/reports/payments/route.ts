import { NextResponse } from "next/server";
import { tenantDb } from "@/lib/db";
import { dayKey } from "@/lib/format";
import { amount, csvContext, csvResponse } from "@/lib/reportsCsv";

/** Payments received in the period. */
export async function GET(req: Request) {
  const ctx = await csvContext(req);
  if (ctx instanceof NextResponse) return ctx;
  const { period, ofBranch } = ctx;
  const db = await tenantDb();
  const rows = await db.payment.findMany({
    where: { date: { gte: period.from, lt: period.to }, invoice: ofBranch },
    include: { invoice: { select: { number: true, customer: { select: { name: true } } } } },
    orderBy: { date: "asc" },
  });
  return csvResponse(
    `payments_${period.fromInput}_${period.toInput}.csv`,
    ["Date", "Invoice", "Customer", "Method", "Reference", "Amount"],
    rows.map((x) => [dayKey(x.date), x.invoice.number, x.invoice.customer.name, x.method, x.reference, amount(x.amount)]),
  );
}
