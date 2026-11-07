// Runs a command with the database variables the app needs, filled in from the
// names Vercel's Neon integration uses (POSTGRES_PRISMA_URL, POSTGRES_URL,
// POSTGRES_URL_NON_POOLING) when the app's own names are not set.
// Usage: node scripts/with-db-env.mjs prisma migrate deploy
import { spawnSync } from "node:child_process";
import { dbEnv } from "./lib/db-env.mjs";

const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { stdio: "inherit", env: dbEnv(), shell: process.platform === "win32" });
process.exit(result.status ?? 1);
