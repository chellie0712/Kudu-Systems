// Shared by the build scripts. Keep in step with src/lib/env-db.ts.
import { createDecipheriv, createHash } from "node:crypto";

/** The URL with ?schema=<name> set. */
export function withSchema(url, schema) {
  if (!url) return "";
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** The URL pointing at another database on the same server. */
export function withDatabase(url, database) {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

/** process.env plus DATABASE_URL(_UNPOOLED) and PLATFORM_DATABASE_URL(_UNPOOLED). */
export function dbEnv(base = process.env) {
  const env = { ...base };
  env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || "";
  env.DATABASE_URL_UNPOOLED ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;
  env.PLATFORM_DATABASE_URL ||= withSchema(env.DATABASE_URL, "platform");
  env.PLATFORM_DATABASE_URL_UNPOOLED ||= withSchema(env.DATABASE_URL_UNPOOLED, "platform");
  return env;
}

/** Decrypts a connection string stored by src/lib/secret.ts. */
export function decryptSecret(value, secret = process.env.AUTH_SECRET) {
  const [v, iv, tag, data] = value.split(":");
  if (v !== "v1" || !secret) throw new Error("Cannot decrypt a company connection string (is AUTH_SECRET set?)");
  const key = createHash("sha256").update(`kudu-company-db:${secret}`).digest();
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
