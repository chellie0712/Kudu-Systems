import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Connection strings for company databases hosted elsewhere are stored encrypted with a
// key derived from AUTH_SECRET. Changing AUTH_SECRET makes them unreadable, so keep it.
// scripts/lib/db-env.mjs decrypts the same format at build time.

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHash("sha256").update(`kudu-company-db:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(value: string): string {
  const [v, iv, tag, data] = value.split(":");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
