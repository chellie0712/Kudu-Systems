import { PrismaClient, type Company } from "@platform-client";
import { platformDatabaseUrl } from "./env-db";

export type { Company };

/** The company whose data is in the main database (the original Kudu data). */
export const MAIN_COMPANY_ID = "main";

const g = globalThis as unknown as { platformDb?: PrismaClient };

/** Platform registry: companies and super-admins. Never holds company data. */
export const platformDb =
  g.platformDb ?? new PrismaClient(platformDatabaseUrl() ? { datasourceUrl: platformDatabaseUrl() } : undefined);
if (process.env.NODE_ENV !== "production") g.platformDb = platformDb;

// Company rows are read on every request; keep them for a short while.
const TTL_MS = 30_000;
const byId = new Map<string, { at: number; company: Company | null }>();

export async function getCompany(id: string): Promise<Company | null> {
  const hit = byId.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.company;
  const company = await platformDb.company.findUnique({ where: { id } });
  byId.set(id, { at: Date.now(), company });
  return company;
}

export function forgetCompany(id: string) {
  byId.delete(id);
}

export async function getCompanyBySlug(slug: string): Promise<Company | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  return platformDb.company.findUnique({ where: { slug: s } });
}

/** Company code rules: lower-case letters, digits and dashes, 2 to 30 characters. */
export function normaliseSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
}

/** Where a company's data lives, for the super-admin screens. */
export function databaseLabel(c: Pick<Company, "databaseName" | "databaseUrl">): string {
  if (c.databaseUrl) return "Own database (external connection)";
  if (c.databaseName) return `Own database: ${c.databaseName}`;
  return "Main database (original Kudu data)";
}
