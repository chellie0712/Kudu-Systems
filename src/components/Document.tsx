import Image from "next/image";
import type { Customer, Settings } from "@prisma/client";
import { money } from "@/lib/format";
import { lineTotal } from "@/lib/totals";

/** Letterhead used on printed quotations, job cards and invoices. */
export function DocHeader({
  settings,
  docType,
  number,
  meta,
}: {
  settings: Settings;
  docType: string;
  number: string;
  meta: [string, string][];
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-6 border-b-4 border-kudu-600 pb-5">
      <div className="space-y-2">
        <Image src="/kudu-logo-sm.png" alt={settings.companyName} width={600} height={389} className="h-20 w-auto" />
        <div className="text-xs leading-relaxed text-charcoal-600">
          <div className="font-semibold text-charcoal-800">{settings.companyName}</div>
          {settings.address && <div className="whitespace-pre-line">{settings.address}</div>}
          {[settings.phone, settings.email, settings.website].filter(Boolean).join(" · ")}
          {settings.vatNumber && <div>VAT no. {settings.vatNumber}</div>}
          {settings.regNumber && <div>Reg. no. {settings.regNumber}</div>}
        </div>
      </div>
      <div className="text-right">
        <div className="text-3xl font-extrabold uppercase tracking-wider text-charcoal-800">{docType}</div>
        <div className="text-lg font-bold text-kudu-600">{number}</div>
        <table className="mt-2 ml-auto text-sm">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 text-right text-charcoal-500">{k}</td>
                <td className="text-right font-medium">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CustomerBlock({ customer, title = "Bill to", extra }: { customer: Customer; title?: string; extra?: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-bold uppercase tracking-wide text-kudu-600">{title}</div>
      <div className="font-semibold">{customer.name}</div>
      {customer.contactPerson && <div className="text-sm">Attn: {customer.contactPerson}</div>}
      {customer.billingAddress && <div className="whitespace-pre-line text-sm">{customer.billingAddress}</div>}
      <div className="text-sm text-charcoal-600">{[customer.phone, customer.email].filter(Boolean).join(" · ")}</div>
      {customer.vatNumber && <div className="text-sm text-charcoal-600">VAT no. {customer.vatNumber}</div>}
      {extra}
    </div>
  );
}

export function ItemsTable({
  items,
  symbol,
}: {
  items: { id: string; description: string; quantity: number; unit: string; unitPrice: number }[];
  symbol: string;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="bg-charcoal-800 text-left text-xs uppercase tracking-wide text-white">
          <th className="px-3 py-2">Description</th>
          <th className="px-3 py-2 text-right">Qty</th>
          <th className="px-3 py-2 text-right">Unit price</th>
          <th className="px-3 py-2 text-right">Amount</th>
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id} className="border-b border-charcoal-100">
            <td className="whitespace-pre-line px-3 py-2">{i.description}</td>
            <td className="px-3 py-2 text-right tabular-nums">
              {i.quantity} {i.unit}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">{money(i.unitPrice, symbol)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{money(lineTotal(i), symbol)}</td>
          </tr>
        ))}
        {items.length === 0 && (
          <tr>
            <td colSpan={4} className="px-3 py-6 text-center text-charcoal-400">No line items</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function TotalsBlock({
  doc,
  symbol,
  extraRows = [],
}: {
  doc: { subtotal: number; discount: number; vatRate: number; vatAmount: number; total: number };
  symbol: string;
  extraRows?: [string, number, boolean?][];
}) {
  return (
    <table className="ml-auto w-full max-w-xs text-sm">
      <tbody>
        <tr><td className="py-1">Subtotal</td><td className="py-1 text-right tabular-nums">{money(doc.subtotal, symbol)}</td></tr>
        {doc.discount > 0 && (
          <tr><td className="py-1">Discount</td><td className="py-1 text-right tabular-nums">− {money(doc.discount, symbol)}</td></tr>
        )}
        <tr><td className="py-1">VAT ({doc.vatRate}%)</td><td className="py-1 text-right tabular-nums">{money(doc.vatAmount, symbol)}</td></tr>
        <tr className="border-t-2 border-charcoal-800 text-base font-bold">
          <td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{money(doc.total, symbol)}</td>
        </tr>
        {extraRows.map(([label, value, strong]) => (
          <tr key={label} className={strong ? "font-bold text-kudu-700" : ""}>
            <td className="py-1">{label}</td><td className="py-1 text-right tabular-nums">{money(value, symbol)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
