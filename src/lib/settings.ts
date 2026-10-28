import { db } from "./db";
import { DEFAULT_PRODUCTS } from "./jobcard";

export async function getSettings() {
  const existing = await db.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  // First run: create settings and the starter product list. The lock stops two
  // simultaneous first requests from seeding the products twice.
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(4242001)`;
    const again = await tx.settings.findUnique({ where: { id: 1 } });
    if (again) return again;
    if ((await tx.product.count()) === 0) {
      await tx.product.createMany({ data: DEFAULT_PRODUCTS.map((p, i) => ({ ...p, sortOrder: i })) });
    }
    return tx.settings.create({ data: { id: 1 } });
  });
}

type Kind = "quote" | "jobCard" | "invoice";

/** Atomically reserve the next document number, e.g. QT-0007. */
export async function nextNumber(kind: Kind): Promise<string> {
  await getSettings();
  const field = kind === "quote" ? "nextQuoteNo" : kind === "jobCard" ? "nextJobCardNo" : "nextInvoiceNo";
  const s = await db.settings.update({ where: { id: 1 }, data: { [field]: { increment: 1 } } });
  const prefix = kind === "quote" ? s.quotePrefix : kind === "jobCard" ? s.jobCardPrefix : s.invoicePrefix;
  return `${prefix}${String(s[field] - 1).padStart(4, "0")}`;
}
