import Link from "next/link";
import { PoStatus, type Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";
import { fmtDate, money } from "@/lib/format";
import { PO_STATUS_LABELS } from "@/lib/purchases";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { PoStatusBadge } from "@/components/PurchaseOrders";

export const metadata = { title: "Purchase orders" };

const VIEWS: { key: string; label: string; where: Prisma.PurchaseOrderWhereInput }[] = [
  { key: "open", label: "Open", where: { status: { notIn: ["RECEIVED", "CANCELLED"] } } },
  { key: "approval", label: "Waiting for approval", where: { status: "AWAITING_APPROVAL" } },
  { key: "incoming", label: "Ordered, not received", where: { status: { in: ["ORDERED", "PARTLY_RECEIVED"] } } },
  { key: "all", label: "All", where: {} },
];

export default async function PurchaseOrdersPage({ searchParams }: { searchParams: Promise<{ view?: string; status?: string; q?: string; msg?: string; err?: string }> }) {
  const user = await requirePermission("purchases.view");
  const db = await tenantDb();
  const settings = await getSettings();
  const { view = "open", status, q = "", msg, err } = await searchParams;
  const current = VIEWS.find((v) => v.key === view) ?? VIEWS[0];
  const rows = await db.purchaseOrder.findMany({
    where: {
      AND: [
        current.where,
        status && status in PoStatus ? { status: status as PoStatus } : {},
        q ? { OR: [{ number: { contains: q, mode: "insensitive" } }, { supplier: { contains: q, mode: "insensitive" } }, { supplierRef: { contains: q, mode: "insensitive" } }] } : {},
      ],
    },
    include: { location: { select: { name: true } }, _count: { select: { lines: true } } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  return (
    <div>
      <PageHeader
        title="Purchase orders"
        subtitle="Order stock and supplies from suppliers, get them approved, and book deliveries straight into stock."
        actions={can(user, "purchases.edit") ? <Link href="/purchase-orders/new" className="btn-primary">+ New purchase order</Link> : undefined}
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <div className="mb-3 flex flex-wrap gap-1">
        {VIEWS.map((v) => (
          <Link key={v.key} href={`/purchase-orders?view=${v.key}`} className={`rounded-full px-3 py-1 text-sm font-medium ${current.key === v.key ? "bg-charcoal-800 text-white" : "bg-white text-charcoal-600 ring-1 ring-charcoal-200 hover:text-kudu-600"}`}>
            {v.label}
          </Link>
        ))}
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="view" value={current.key} />
        <input name="q" defaultValue={q} placeholder="Search number, supplier or reference" className="input max-w-xs" />
        <select name="status" defaultValue={status ?? ""} className="input w-auto">
          <option value="">Any status</option>
          {(Object.keys(PO_STATUS_LABELS) as PoStatus[]).map((s) => <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>)}
        </select>
        <button className="btn-dark">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? (
          <Empty>No purchase orders here.</Empty>
        ) : (
          <table className="table">
            <thead><tr><th>Number</th><th>Supplier</th><th>Deliver to</th><th>Date</th><th>Status</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/purchase-orders/${p.id}`} className="font-semibold text-kudu-700 hover:underline">{p.number}</Link></td>
                  <td>{p.supplier}{p.supplierRef && <div className="text-xs text-charcoal-500">Ref {p.supplierRef}</div>}</td>
                  <td className="text-sm">{p.location?.name ?? "—"}</td>
                  <td className="text-sm whitespace-nowrap">{fmtDate(p.createdAt)}{p.expectedAt && <div className="text-xs text-charcoal-500">expected {fmtDate(p.expectedAt)}</div>}</td>
                  <td><PoStatusBadge status={p.status} /></td>
                  <td className="text-right tabular-nums">{money(p.total, settings.currencySymbol)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
