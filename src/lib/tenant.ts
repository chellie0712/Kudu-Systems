import { PrismaClient } from "@prisma/client";
import type { Company } from "./platform";
import { mainDatabaseUrl, mainDatabaseUrlUnpooled, withDatabase } from "./env-db";
import { decryptSecret } from "./secret";

/** Pooled connection string for a company's own database. */
export function companyDatabaseUrl(company: Pick<Company, "databaseName" | "databaseUrl">, pooled = true): string {
  if (company.databaseUrl) return decryptSecret(company.databaseUrl);
  const base = pooled ? mainDatabaseUrl() : mainDatabaseUrlUnpooled();
  if (company.databaseName) return withDatabase(base, company.databaseName);
  return base;
}

const g = globalThis as unknown as { tenantClients?: Map<string, PrismaClient> };
const clients = (g.tenantClients ??= new Map());

/** One Prisma client per company database, reused across requests. */
export function clientForCompany(company: Company): PrismaClient {
  const url = companyDatabaseUrl(company);
  const cacheKey = `${company.id}|${url}`;
  let client = clients.get(cacheKey);
  if (!client) {
    client = new PrismaClient(url ? { datasourceUrl: url } : undefined);
    clients.set(cacheKey, client);
  }
  return client;
}
