import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { can } from "@/lib/permissions";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { fmtQty } from "@/lib/inventory";
import { maySend, poApprovalState } from "@/lib/approval";
import { PO_EDITABLE, PO_RECEIVABLE } from "@/lib/purchases";
import { approvePo, cancelPo, deletePo, markPoOrdered, receivePo, rejectPo, requestPoApproval } from "@/app/actions/purchases";
import { Flash, PageHeader, SectionTitle } from "@/components/ui";
import { ConfirmButton, PrintButton } from "@/components/ConfirmButton";
import { ApprovalPanel } from "@/components/Approvals";
import { PoStatusBadge } from "@/components/PurchaseOrders";
import { CompanyLogo } from "@/components/CompanyLogo";

export default async function PurchaseOrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const user = await requirePermission("purchases.view");
  const db = await tenantDb();
  const { id } = await params;
  const { msg, err } = await searchParams;
  const [po, settings] = await Promise.all([
    db.purchaseOrder.findUnique({
      where: { id },
      include: { location: { select: { id: true, name: true } }, lines: { orderBy: { sortOrder: "asc" }, include: { item: { select: { unit: true } } } } },
    }),
    getSettings(),
  ]);
  if (!po) notFound();
  const edit = can(user, "purchases.edit");
  const approval = poApprovalState(po, settings);
  const editable = PO_EDITABLE.includes(po.status);
  const receivable = PO_RECEIVABLE.includes(po.status);
  const locations = receivable && edit ? await db.stockLocation.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }) : [];
  const m = (c: number) => money(c, settings.currencySymbol);

  return (
    <div className="max-w-4xl">
      <PageHeader
        back={{ href: "/purchase-orders", label: "Purchase orders" }}
        title={<span className="flex flex-wrap items-center gap-3">{po.number} <PoStatusBadge status={po.status} /></span>}
        subtitle={`${po.supplier} · created ${fmtDate(po.createdAt)} by ${po.createdBy || "?"}${po.orderedAt ? ` · ordered ${fmtDate(po.orderedAt)}` : ""}`}
        actions={
          <>
            {edit && editable && <Link href={`/purchase-orders/${po.id}/edit`} className="btn-outline">Edit</Link>}
            {edit && editable && maySend(approval) && (
              <form action={markPoOrdered}>
                <input type="hidden" name="id" value={po.id} />
                <button className="btn-primary">Mark as ordered</button>
              </form>
            )}
            <PrintButton />
          </>
        }
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />

      {editable && (
        <ApprovalPanel
          state={approval}
          doc={po}
          canApprove={can(user, "purchases.approve")}
          canRequest={edit}
          actions={{ request: requestPoApproval, approve: approvePo, reject: rejectPo }}
          blockedText="Needs approval before it can be ordered."
          ready="It can now be ordered from the supplier."
        />
      )}

      {receivable && edit && (
        <form action={receivePo} className="no-print card mb-6 p-5">
          <SectionTitle>Book in a delivery</SectionTitle>
          <input type="hidden" name="id" value={po.id} />
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Line</th><th className="text-right">Ordered</th><th className="text-right">Received so far</th><th className="w-32">Arrived now</th></tr></thead>
              <tbody>
                {po.lines.map((l) => {
                  const left = Math.max(0, l.quantity - l.received);
                  return (
                    <tr key={l.id}>
                      <td>{l.description}{!l.itemId && <div className="text-xs text-charcoal-500">Not a stock item</div>}</td>
                      <td className="text-right tabular-nums">{fmtQty(l.quantity, l.item?.unit)}</td>
                      <td className="text-right tabular-nums">{fmtQty(l.received, l.item?.unit)}</td>
                      <td><input name={`recv_${l.id}`} inputMode="decimal" className="input py-1.5" defaultValue={left > 0 ? String(Math.round(left * 1000) / 1000) : ""} aria-label={`Arrived now: ${l.description}`} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="block w-60">
              <span className="label">Into stock at</span>
              <select name="locationId" className="input" defaultValue={po.locationId ?? locations[0]?.id ?? ""}>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </label>
            <button className="btn-primary">Book in</button>
          </div>
          <p className="mt-2 text-xs text-charcoal-500">Stock items are added to that location at this order&apos;s prices, which also become their cost prices. Book in a part delivery now and the rest later.</p>
        </form>
      )}

      <div className="card print-sheet p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <CompanyLogo logo={settings.logo} name={settings.companyName} className="mb-2 h-14 w-auto" />
            <div className="text-sm text-charcoal-600 whitespace-pre-line">{[settings.companyName, settings.address, settings.phone, settings.email, settings.vatNumber && `VAT ${settings.vatNumber}`].filter(Boolean).join("\n")}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-charcoal-800">PURCHASE ORDER</div>
            <div className="text-lg font-semibold text-kudu-700">{po.number}</div>
            <div className="text-sm text-charcoal-600">Date {fmtDate(po.orderedAt ?? po.createdAt)}</div>
            {po.expectedAt && <div className="text-sm text-charcoal-600">Delivery by {fmtDate(po.expectedAt)}</div>}
          </div>
        </div>
        <div className="mb-6 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-charcoal-500 uppercase">Supplier</div>
            <div className="font-semibold">{po.supplier}</div>
            {po.supplierEmail && <div>{po.supplierEmail}</div>}
            {po.supplierRef && <div>Your ref: {po.supplierRef}</div>}
          </div>
          <div>
            <div className="text-xs font-semibold text-charcoal-500 uppercase">Deliver to</div>
            <div>{po.location?.name ?? settings.companyName}</div>
            {settings.address && <div className="whitespace-pre-line text-charcoal-600">{settings.address}</div>}
          </div>
        </div>
        <table className="table">
          <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit price</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {po.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.description}</td>
                <td className="text-right tabular-nums">{fmtQty(l.quantity, l.item?.unit)}</td>
                <td className="text-right tabular-nums">{m(l.unitCost)}</td>
                <td className="text-right tabular-nums">{m(Math.round(l.quantity * l.unitCost))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 ml-auto max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{m(po.subtotal)}</span></div>
          <div className="flex justify-between"><span>VAT ({po.vatRate}%)</span><span className="tabular-nums">{m(po.vatAmount)}</span></div>
          <div className="flex justify-between border-t border-charcoal-200 pt-1 font-bold"><span>Total</span><span className="tabular-nums">{m(po.total)}</span></div>
        </div>
        {po.notes && <p className="mt-6 text-sm whitespace-pre-line">{po.notes}</p>}
        {po.approvedAt && <p className="mt-6 text-xs text-charcoal-500">Approved by {po.approvedBy} on {fmtDateTime(po.approvedAt)}</p>}
      </div>

      <div className="no-print mt-6 flex flex-wrap justify-end gap-4">
        {edit && po.status !== "RECEIVED" && po.status !== "CANCELLED" && (
          <form action={cancelPo}>
            <input type="hidden" name="id" value={po.id} />
            <ConfirmButton message={`Cancel ${po.number}?${po.status === "PARTLY_RECEIVED" ? " What was received stays in stock." : ""}`} className="text-sm text-charcoal-500 hover:text-kudu-600">Cancel order</ConfirmButton>
          </form>
        )}
        {can(user, "purchases.delete") && !po.lines.some((l) => l.received > 0) && (
          <form action={deletePo}>
            <input type="hidden" name="id" value={po.id} />
            <ConfirmButton message={`Delete ${po.number}?`} className="text-sm text-kudu-700 hover:underline">Delete</ConfirmButton>
          </form>
        )}
      </div>
    </div>
  );
}
