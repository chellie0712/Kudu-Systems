import { apiRoute } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";

/** Checks a key: which company it belongs to and what it may do. */
export const GET = apiRoute("read", async (_req, ctx) => ({ company: ctx.company, key: { name: ctx.keyName, access: ctx.access } }));
