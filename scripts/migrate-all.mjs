// Applies database migrations everywhere, on every deploy:
//   1. the platform registry (schema "platform" of the main database),
//   2. the main database (the original Kudu company),
//   3. every other company's own database.
// A failure stops the build, so the app never runs against a half-migrated company.
import { spawnSync } from "node:child_process";
import pg from "pg";
import { dbEnv, decryptSecret, withDatabase } from "./lib/db-env.mjs";

const env = dbEnv();
if (!env.DATABASE_URL) {
  console.error("No database configured (DATABASE_URL or POSTGRES_URL).");
  process.exit(1);
}

function prismaDeploy(label, extraEnv, schema) {
  console.log(`\n▶ Migrating ${label}`);
  const args = ["prisma", "migrate", "deploy", ...(schema ? ["--schema", schema] : [])];
  const r = spawnSync("npx", args, { stdio: "inherit", env: { ...env, ...extraEnv }, shell: process.platform === "win32" });
  if (r.status !== 0) {
    console.error(`✖ Migration failed for ${label}`);
    process.exit(r.status ?? 1);
  }
}

prismaDeploy("platform registry", {}, "prisma/platform/schema.prisma");
prismaDeploy("main database (company: kudu)", {});

const client = new pg.Client({ connectionString: env.DATABASE_URL_UNPOOLED });
await client.connect();
const { rows } = await client.query(
  `SELECT slug, "databaseName", "databaseUrl" FROM platform."Company"
   WHERE "databaseName" IS NOT NULL OR "databaseUrl" IS NOT NULL ORDER BY slug`,
);
await client.end();

for (const c of rows) {
  const url = c.databaseUrl ? decryptSecret(c.databaseUrl, env.AUTH_SECRET) : null;
  const pooled = url ?? withDatabase(env.DATABASE_URL, c.databaseName);
  const direct = url ?? withDatabase(env.DATABASE_URL_UNPOOLED, c.databaseName);
  prismaDeploy(`company: ${c.slug}`, { DATABASE_URL: pooled, DATABASE_URL_UNPOOLED: direct });
}
console.log(`\n✔ All databases migrated (${rows.length + 1} companies).`);
