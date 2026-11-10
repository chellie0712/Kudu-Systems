// The AI copilot: a conversation with Claude that can look things up in Kudu (./tools.ts) as the
// person asking. Needs ANTHROPIC_API_KEY on the server (Vercel → Settings → Environment Variables).
import Anthropic from "@anthropic-ai/sdk";
import type { PrismaClient } from "@prisma/client";
import type { AppUser } from "@/auth";
import { runTool, toolDefinitions, toolLabel } from "./tools";

export const MODEL = "claude-opus-5-5";
/** Dollars per million tokens, for the cost shown in Settings. */
export const PRICE = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 };
const MAX_STEPS = 8; // look-ups in one answer
export const MAX_MESSAGES = 60; // a chat this long is closed; start a new one

export const aiConfigured = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120_000 }));

export type CopilotEvent =
  | { type: "text"; text: string }
  | { type: "tool"; label: string }
  | { type: "error"; message: string }
  | { type: "done"; chatId: string; title: string };

function systemPrompt(user: AppUser, company: string): string {
  const today = new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());
  return `You are the copilot inside Kudu, the CRM ${company} uses to run its pest control business in South Africa: customers, quotations, job cards, invoices, payments, customer queries and tasks. Money is in rand (ZAR), VAT is 15%.

You are helping ${user.name}, whose role is ${user.roleName}. Today is ${today}.

How to work:
- Look things up with the tools before answering questions about customers, jobs, money or tasks. Never guess a number, name or date that a tool can give you. If a tool says the person may not see something, tell them that plainly.
- Keep answers short and practical: short paragraphs and simple bullet lists, no tables or headings. Use South African English. Write amounts like R1 234,50 and dates like 12 Nov 2026.
- When you mention a record, link it with the link the tool gave, e.g. [QT-0012](/quotations/abc). Only use links that tools returned.
- You can draft emails, letters, SMS and WhatsApp messages, quotation wording and summaries as text for the person to copy. You cannot send anything yourself, and you cannot change customers, quotations, job cards or invoices; tell them where in Kudu to do it.
- The only thing you can change is adding a task, and only when they ask for one.
- Pest control advice must follow the product label and South African regulations; say so when it matters, and don't give dosage figures from memory.`;
}

type Msg = Anthropic.Beta.BetaMessageParam;

export async function runCopilot(opts: {
  db: PrismaClient;
  user: AppUser;
  company: string;
  chat: { id: string; messages: Msg[] };
  question: string;
  send: (e: CopilotEvent) => void;
}): Promise<{ messages: Msg[]; usage: { input: number; output: number; cacheRead: number; cacheWrite: number }; ok: boolean }> {
  const { db, user, send } = opts;
  const messages: Msg[] = [...opts.chat.messages, { role: "user", content: opts.question }];
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const system = systemPrompt(user, opts.company);
  let badJson = 0;

  for (let step = 0; step <= MAX_STEPS; step++) {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // if Claude declines, the API retries on a fallback model in the same call
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      system,
      tools: toolDefinitions,
      // On the last allowed step it may not look anything else up, so it answers with what it has.
      ...(step === MAX_STEPS ? { tool_choice: { type: "none" as const } } : {}),
      messages,
    });
    stream.on("text", (t) => send({ type: "text", text: t }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      badJson = 0;
    } catch (e) {
      // A tool input that could not be read at all: ask again, at most twice. API errors go up.
      if (e instanceof Anthropic.APIError || badJson++ >= 2) throw e;
      continue;
    }
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      send({ type: "text", text: "\n\nI can't help with that one." });
      return { messages: opts.chat.messages, usage, ok: false }; // keep the refused turn out of the history
    }
    messages.push({ role: "assistant", content: message.content });
    if (message.stop_reason === "pause_turn") continue;

    const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || !calls.length) {
      if (message.stop_reason === "max_tokens") send({ type: "text", text: "\n\n(The answer was cut short. Ask me to continue.)" });
      return { messages, usage, ok: true };
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      send({ type: "tool", label: toolLabel(call.name) });
      const [content, isError] = await runTool({ db, user }, call.name, call.input);
      results.push({ type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) });
    }
    messages.push({ role: "user", content: results });
    send({ type: "text", text: "\n\n" });
  }
  return { messages, usage, ok: true };
}

/** Plain words for an API failure. */
export function errorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The Claude API key on the server is not valid. An admin needs to check ANTHROPIC_API_KEY in Vercel.";
  if (e instanceof Anthropic.PermissionDeniedError) return "The Claude account does not allow this. Check the account's plan and model access.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy or the account's usage limit is reached. Try again in a minute.";
  if (e instanceof Anthropic.BadRequestError) return "Claude could not take that request. The Claude account may be out of credit (check platform.claude.com), or the chat is too long: start a new chat.";
  if (e instanceof Anthropic.APIConnectionError) return "Could not reach Claude. Try again.";
  if (e instanceof Anthropic.APIError) return "Claude had a problem answering. Try again.";
  return "Something went wrong. Try again.";
}

export const costUsd = (u: { inputTokens: number; outputTokens: number; cacheRead: number; cacheWrite: number }) =>
  (u.inputTokens * PRICE.input + u.outputTokens * PRICE.output + u.cacheRead * PRICE.cacheRead + u.cacheWrite * PRICE.cacheWrite) / 1_000_000;
