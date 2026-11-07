// Copies the company-database migrations (prisma/migrations) into
// src/generated/tenant-migrations.json, so the app can set up a new company's
// database at runtime, where the Prisma CLI is not available.
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "prisma/migrations";
const migrations = readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "migration.sql")))
  .map((d) => d.name)
  .sort()
  .map((name) => {
    const sql = readFileSync(join(dir, name, "migration.sql"), "utf8");
    // Same checksum Prisma records, so `prisma migrate deploy` treats these as applied.
    return { name, checksum: createHash("sha256").update(sql).digest("hex"), sql };
  });
mkdirSync("src/generated", { recursive: true });
writeFileSync("src/generated/tenant-migrations.json", JSON.stringify(migrations, null, 1));
console.log(`Bundled ${migrations.length} company-database migrations.`);
