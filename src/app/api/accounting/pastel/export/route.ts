import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { can } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { exportCustomers, exportInvoices, exportReceipts, type Format } from "@/lib/accounting/pastelFiles";
import { AccountingError } from "@/lib/accounting/types";
import { dayKey } from "@/lib/format";

/** Settings → Accounting (Pastel): downloads a customers, invoices or receipts file. POST, because it marks what it exported. */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user || !can(user, "settings.manage")) return new NextResponse("Not allowed", { status: 403 });
  const fd = await req.formData();
  const kind = String(fd.get("kind") ?? "");
  const format: Format = fd.get("format") === "evolution" ? "evolution" : "partner";
  const all = fd.get("all") === "on";
  const db = await tenantDb();
  try {
    const r =
      kind === "customers"
        ? await exportCustomers(db, { all, format })
        : kind === "invoices"
          ? await exportInvoices(db, { all, format })
          : kind === "receipts"
            ? await exportReceipts(db, { all, format, positive: fd.get("positive") === "on" })
            : null;
    if (!r) return new NextResponse("Unknown export", { status: 400 });
    const name = `kudu-${kind}-${format}-${dayKey(new Date())}.csv`;
    return new NextResponse(r.csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Kudu-Rows": String(r.count),
      },
    });
  } catch (e) {
    const text = e instanceof AccountingError || e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(new URL(`/settings?err=${encodeURIComponent(text)}#accounting`, req.url), 303);
  }
}
