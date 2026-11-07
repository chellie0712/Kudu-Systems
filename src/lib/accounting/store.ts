import type { PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/secret";
import { AccountingError, type Ctx, type Link, type ProviderId } from "./types";

type Db = Pick<PrismaClient, "accountingLink">;

/**
 * Credentials are one JSON object encrypted with AUTH_SECRET. The first Sage version stored just
 * the encrypted password; that older form is read as { password }.
 */
export function readCredentials(stored: string | null): Record<string, string> {
  if (!stored) return {};
  const plain = decryptSecret(stored);
  if (!plain.startsWith("{")) return { password: plain };
  try {
    return JSON.parse(plain) as Record<string, string>;
  } catch {
    return {};
  }
}

export const writeCredentials = (c: Record<string, string>) => encryptSecret(JSON.stringify(c));

const asConfig = (v: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries((v && typeof v === "object" ? v : {}) as Record<string, unknown>).map(([k, x]) => [k, x == null ? "" : String(x)]));

export async function loadLink(db: Db, provider: ProviderId): Promise<Link | null> {
  const row = await db.accountingLink.findUnique({ where: { provider } });
  if (!row) return null;
  return { provider, credentials: readCredentials(row.credentials), orgId: row.orgId, orgName: row.orgName, config: asConfig(row.config) };
}

export async function ctxFor(db: Db, provider: ProviderId): Promise<Ctx> {
  const link = await loadLink(db, provider);
  if (!link || Object.keys(link.credentials).length === 0) throw new AccountingError("The accounting package is not connected. Connect it in Settings → Accounting.");
  return {
    link,
    saveCredentials: async (c) => {
      await db.accountingLink.update({ where: { provider }, data: { credentials: writeCredentials(c) } });
    },
  };
}

/** Creates or updates the link row. Pass only what changes. */
export async function saveLink(
  db: Db,
  provider: ProviderId,
  data: { credentials?: Record<string, string> | null; orgId?: string; orgName?: string; config?: Record<string, string> },
) {
  const row = {
    ...(data.credentials !== undefined ? { credentials: data.credentials === null ? null : writeCredentials(data.credentials) } : {}),
    ...(data.orgId !== undefined ? { orgId: data.orgId } : {}),
    ...(data.orgName !== undefined ? { orgName: data.orgName } : {}),
    ...(data.config !== undefined ? { config: data.config } : {}),
  };
  await db.accountingLink.upsert({ where: { provider }, create: { provider, ...row }, update: row });
}

/** "provider:organisation": which books an ID kept on a customer/invoice/payment belongs to. */
export const linkKey = (link: { provider: string; orgId: string }) => `${link.provider}:${link.orgId}`;
