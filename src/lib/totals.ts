export type LineItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number; // cents, excl. VAT
};

export function lineTotal(item: Pick<LineItemInput, "quantity" | "unitPrice">): number {
  return Math.round(item.quantity * item.unitPrice);
}

/** subtotal is before discount; VAT is charged on (subtotal - discount). */
export function computeTotals(items: LineItemInput[], vatRate: number, discount: number) {
  const subtotal = items.reduce((sum, i) => sum + lineTotal(i), 0);
  const net = Math.max(0, subtotal - discount);
  const vatAmount = Math.round((net * vatRate) / 100);
  return { subtotal, vatAmount, total: net + vatAmount };
}
