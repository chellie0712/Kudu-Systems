import { randomUUID } from "node:crypto";
import pg from "pg";
import migrations from "@/generated/tenant-migrations.json";
import { mainDatabaseUrlUnpooled, withDatabase } from "./env-db";

type Migration = { name: string; checksum: string; sql: string };

/** Database name for a company code, e.g. "acme-pest" → "company_acme_pest". */
export function databaseNameFor(slug: string): string {
  return `company_${slug.replace(/-/g, "_")}`;
}

/** Creates the database on the main server unless it exists. Needs the direct (unpooled) URL. */
export async function createDatabase(name: string): Promise<void> {
  if (!/^company_[a-z0-9_]+$/.test(name)) throw new Error("Invalid database name");
  const client = new pg.Client({ connectionString: mainDatabaseUrlUnpooled() });
  await client.connect();
  try {
    const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    // CREATE DATABASE cannot take parameters; the name was validated above.
    if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${name}"`);
  } finally {
    await client.end();
  }
}

export function directUrlForDatabase(name: string): string {
  return withDatabase(mainDatabaseUrlUnpooled(), name);
}

/**
 * Applies every company-database migration that is not yet applied, recording each one in
 * _prisma_migrations exactly as `prisma migrate deploy` does, so later deploys continue from here.
 */
export async function migrateCompanyDatabase(directUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: directUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) PRIMARY KEY NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    )`);
    const done = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    const doneNames = new Set(done.rows.map((r) => r.migration_name));
    for (const m of migrations as Migration[]) {
      if (doneNames.has(m.name)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql); // simple query protocol: runs the whole file
        await client.query(
          `INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
           VALUES ($1, $2, $3, now(), now(), 1)`,
          [randomUUID(), m.checksum, m.name],
        );
        await client.query("COMMIT");
        applied.push(m.name);
      } catch (e) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${m.name} failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}
