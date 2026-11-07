import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { fmtQty, MOVEMENT_LABELS, movementPlaces } from "@/lib/inventory";

/** Stock movement history (inventory, item and van pages). */
export function MovementTable({
  rows,
  showItem = false,
  itemLinks = true,
}: {
  rows: {
    id: string;
    kind: keyof typeof MOVEMENT_LABELS;
    quantity: number;
    note: string;
    userName: string;
    createdAt: Date;
    invoiceId: string | null;
    item: { id: string; name: string; unit: string };
    fromLocation: { name: string } | null;
    toLocation: { name: string } | null;
    jobCard: { id: string; number: string } | null;
  }[];
  showItem?: boolean;
  itemLinks?: boolean;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>When</th>
          {showItem && <th>Item</th>}
          <th>What</th>
          <th className="text-right">Qty</th>
          <th>Where</th>
          <th>Job / note</th>
          <th>By</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="whitespace-nowrap text-sm">{fmtDateTime(m.createdAt)}</td>
            {showItem && <td>{itemLinks ? <Link href={`/inventory/${m.item.id}`} className="text-kudu-700 hover:underline">{m.item.name}</Link> : m.item.name}</td>}
            <td className="text-sm">{MOVEMENT_LABELS[m.kind]}{m.invoiceId && <span className="text-xs text-charcoal-500"> · billed</span>}</td>
            <td className="text-right tabular-nums">{m.kind === "ADJUST" && m.quantity > 0 ? "+" : ""}{fmtQty(m.quantity, m.item.unit)}</td>
            <td className="text-sm">{movementPlaces(m)}</td>
            <td className="text-sm">
              {m.jobCard && <Link href={`/job-cards/${m.jobCard.id}`} className="text-kudu-600 hover:underline">{m.jobCard.number}</Link>}
              {m.jobCard && m.note && " · "}
              {m.note}
            </td>
            <td className="text-sm">{m.userName}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
