import type Anthropic from "@anthropic-ai/sdk";
import { getUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { MAX_MESSAGES, MODEL, aiConfigured, errorMessage, runCopilot, type CopilotEvent } from "@/lib/ai/copilot";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const json = (status: number, message: string) => Response.json({ error: message }, { status });

/** Start of today in South Africa, for the daily limit. */
function todayStart(): Date {
  const d = new Date(Date.now() + 2 * 3600_000);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 2 * 3600_000);
}

/**
 * Asks the copilot one question. Body: { chatId?: string, question: string }.
 * Answers with lines of JSON (one CopilotEvent per line) as the answer is written.
 */
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return json(401, "Not signed in");
  if (!can(user, "ai.use")) return json(403, "You don't have access to the copilot.");
  const db = await tenantDb();
  const settings = await db.settings.findUnique({ where: { id: 1 }, select: { aiEnabled: true, aiDailyLimit: true, companyName: true } });
  if (!settings?.aiEnabled) return json(403, "The copilot is switched off in Settings.");
  if (!aiConfigured()) return json(503, "The copilot is not set up yet: ANTHROPIC_API_KEY must be added in Vercel.");

  const body = (await req.json().catch(() => null)) as { chatId?: unknown; question?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim().slice(0, 4000) : "";
  if (!question) return json(400, "Ask a question.");

  if (settings.aiDailyLimit > 0) {
    const used = await db.aiUsage.count({ where: { userId: user.id, createdAt: { gte: todayStart() } } });
    if (used >= settings.aiDailyLimit) return json(429, `You've reached today's limit of ${settings.aiDailyLimit} question${settings.aiDailyLimit === 1 ? "" : "s"}. It resets at midnight. An admin can change the limit in Settings.`);
  }

  const chatId = typeof body?.chatId === "string" ? body.chatId : "";
  const existing = chatId ? await db.aiChat.findFirst({ where: { id: chatId, userId: user.id } }) : null;
  if (chatId && !existing) return json(404, "That chat no longer exists.");
  const history = (Array.isArray(existing?.messages) ? existing.messages : []) as unknown as Anthropic.Beta.BetaMessageParam[];
  if (history.length >= MAX_MESSAGES) return json(400, "This chat is long. Start a new chat to keep answers quick and cheap.");
  const chat = existing ?? (await db.aiChat.create({ data: { userId: user.id, title: question.replace(/\s+/g, " ").slice(0, 80) } }));

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: CopilotEvent) => {
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
        } catch {
          // the browser went away; keep going so the answer is saved
        }
      };
      let kept = true;
      try {
        const out = await runCopilot({ db, user, company: settings.companyName || "your company", chat: { id: chat.id, messages: history }, question, send });
        await db.$transaction([
          db.aiChat.update({ where: { id: chat.id }, data: { messages: out.messages as unknown as object[] } }),
          db.aiUsage.create({ data: { userId: user.id, chatId: chat.id, model: MODEL, inputTokens: out.usage.input, outputTokens: out.usage.output, cacheRead: out.usage.cacheRead, cacheWrite: out.usage.cacheWrite } }),
        ]);
      } catch (e) {
        console.error("Copilot failed", e);
        send({ type: "error", message: errorMessage(e) });
        if (!existing) {
          kept = false;
          await db.aiChat.delete({ where: { id: chat.id } }).catch(() => undefined);
        }
      }
      send({ type: "done", chatId: kept ? chat.id : "", title: chat.title });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
