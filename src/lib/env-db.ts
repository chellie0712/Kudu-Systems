// Database URLs from the environment. Keep in step with scripts/lib/db-env.mjs.

/** Main database, pooled. Vercel's Neon integration names it POSTGRES_URL. */
export function mainDatabaseUrl(): string {
  return process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL || "";
}

/** Main database, direct (not pooled). Needed for CREATE DATABASE and migrations. */
export function mainDatabaseUrlUnpooled(): string {
  return process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || mainDatabaseUrl();
}

export function withSchema(url: string, schema: string): string {
  const u = new URL(url);
  u.searchParams.set("schema", schema);
  return u.toString();
}

/** Same server and credentials, another database. */
export function withDatabase(url: string, database: string): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  return u.toString();
}

export function platformDatabaseUrl(): string {
  if (process.env.PLATFORM_DATABASE_URL) return process.env.PLATFORM_DATABASE_URL;
  const main = mainDatabaseUrl();
  return main ? withSchema(main, "platform") : "";
}
