// The API for other systems (/api/v1/...). A request carries an API key made under
// Settings → API & webhooks:  Authorization: Bearer kudu_<company code>_<secret>
// The company code in the key picks the company's database; only a hash of the key is stored.
import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { getCompanyBySlug } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import type { ApiAccess } from "./defs";

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new key for this company. The whole key is shown once; keep `hash` and `prefix`. */
export function newApiKey(companySlug: string) {
  const key = `kudu_${companySlug}_${randomBytes(24).toString("base64url")}`;
  return { key, hash: hashKey(key), prefix: `${key.slice(0, companySlug.length + 9)}…` };
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export const apiError = (status: number, code: string, message: string) =>
  NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });

export type ApiContext = { db: PrismaClient; access: ApiAccess; keyName: string; company: { slug: string; name: string } };

// Per key, per server: at most this many requests a minute. A rough guard against a runaway script.
const LIMIT = 120;
const g = globalThis as unknown as { apiHits?: Map<string, { minute: number; n: number }> };
const hits = (g.apiHits ??= new Map());

function limited(keyHash: string): boolean {
  const minute = Math.floor(Date.now() / 60_000);
  const h = hits.get(keyHash);
  if (!h || h.minute !== minute) {
    hits.set(keyHash, { minute, n: 1 });
    if (hits.size > 5000) hits.clear();
    return false;
  }
  return ++h.n > LIMIT;
}

async function authenticate(req: Request, need: ApiAccess): Promise<ApiContext> {
  const header = req.headers.get("authorization") ?? "";
  const key = header.match(/^Bearer\s+(\S+)$/i)?.[1] ?? req.headers.get("x-api-key") ?? "";
  const m = key.match(/^kudu_([a-z0-9-]{2,30})_[A-Za-z0-9_-]{20,}$/);
  if (!m) throw new ApiError(401, "unauthorized", "Send your API key as: Authorization: Bearer kudu_…");
  const company = await getCompanyBySlug(m[1]);
  if (!company || !company.active) throw new ApiError(401, "unauthorized", "The API key is not valid.");
  const db = clientForCompany(company);
  const hash = hashKey(key);
  const row = await db.apiKey.findUnique({ where: { hash } });
  if (!row || row.revokedAt) throw new ApiError(401, "unauthorized", "The API key is not valid or has been revoked.");
  if (limited(hash)) throw new ApiError(429, "rate_limited", `Too many requests: at most ${LIMIT} a minute.`);
  if (need === "write" && row.access !== "write") throw new ApiError(403, "forbidden", "This API key may only read. Make a read and write key to add or change things.");
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    await db.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
  }
  const s = await db.settings.findUnique({ where: { id: 1 }, select: { companyName: true } });
  return { db, access: row.access === "write" ? "write" : "read", keyName: row.name, company: { slug: company.slug, name: s?.companyName ?? company.name } };
}

/** Wraps an API route: checks the key, turns errors into JSON answers. */
export function apiRoute<P = Record<string, string>>(need: ApiAccess, handler: (req: Request, ctx: ApiContext, params: P) => Promise<unknown>) {
  return async (req: Request, route: { params: Promise<P> }) => {
    try {
      const ctx = await authenticate(req, need);
      const out = await handler(req, ctx, await route.params);
      if (out instanceof Response) return out;
      return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof ApiError) return apiError(e.status, e.code, e.message);
      console.error("API error", e);
      return apiError(500, "server_error", "Something went wrong on our side.");
    }
  };
}

// ---------- Lists ----------

/** ?limit=, ?cursor= and ?updatedSince= for list endpoints. Newest first. */
export function listParams(req: Request) {
  const q = new URL(req.url).searchParams;
  const limit = Math.min(100, Math.max(1, Math.floor(Number(q.get("limit")) || 50)));
  const cursor = q.get("cursor") || undefined;
  const since = q.get("updatedSince");
  let updatedSince: Date | undefined;
  if (since) {
    updatedSince = new Date(since);
    if (Number.isNaN(updatedSince.getTime())) throw new ApiError(400, "bad_request", "updatedSince must be a date, e.g. 2026-11-01T00:00:00Z");
  }
  return { limit, cursor, updatedSince, q };
}

/** Prisma arguments for one page, and how to turn the rows into { data, nextCursor }. */
export function page(p: { limit: number; cursor?: string }) {
  return {
    args: {
      take: p.limit + 1,
      ...(p.cursor ? { cursor: { id: p.cursor }, skip: 1 } : {}),
      orderBy: [{ createdAt: "desc" as const }, { id: "desc" as const }],
    },
    out: <T extends { id: string }, O>(rows: T[], map: (r: T) => O) => ({
      data: rows.slice(0, p.limit).map(map),
      nextCursor: rows.length > p.limit ? rows[p.limit - 1].id : null,
    }),
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new ApiError(400, "bad_request", "Send a JSON object in the body, with Content-Type: application/json.");
}

export function notFound(what: string): never {
  throw new ApiError(404, "not_found", `No ${what} with that id.`);
}
