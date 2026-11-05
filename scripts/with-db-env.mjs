// Runs a command with DATABASE_URL / DATABASE_URL_UNPOOLED filled in from the
// names Vercel's Neon integration uses (POSTGRES_PRISMA_URL, POSTGRES_URL,
// POSTGRES_URL_NON_POOLING) when the app's own names are not set.
// Usage: node scripts/with-db-env.mjs prisma migrate deploy
import { spawnSync } from "node:child_process";

const env = { ...process.env };
env.DATABASE_URL ||= env.POSTGRES_PRISMA_URL || env.POSTGRES_URL || "";
env.DATABASE_URL_UNPOOLED ||= env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL;

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: "inherit", env, shell: process.platform === "win32" });
process.exit(result.status ?? 1);
