import Link from "next/link";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDate } from "@/lib/format";
import { MAX_MESSAGES, aiConfigured } from "@/lib/ai/copilot";
import { deleteChat } from "@/app/actions/copilot";
import { ConfirmButton } from "@/components/ConfirmButton";
import { CopilotChat, type Turn } from "@/components/Copilot";
import { Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Copilot" };

type Block = { type: string; text?: string };
type Stored = { role: "user" | "assistant"; content: string | Block[] };

/** The stored exchange as the person saw it: their questions and the answers' text (look-ups left out). */
function turnsOf(messages: Stored[]): Turn[] {
  const out: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      if (typeof m.content === "string") out.push({ role: "user", text: m.content });
      continue; // tool results
    }
    const text = Array.isArray(m.content) ? m.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("") : String(m.content);
    const last = out[out.length - 1];
    if (last?.role === "assistant") last.text += text ? `\n\n${text}` : "";
    else out.push({ role: "assistant", text });
  }
  return out.filter((t) => t.text.trim());
}

export default async function CopilotPage({ searchParams }: { searchParams: Promise<{ chat?: string; ask?: string }> }) {
  const user = await requirePermission("ai.use");
  const { chat: chatId, ask } = await searchParams;
  const db = await tenantDb();
  const [settings, chats] = await Promise.all([
    db.settings.findUnique({ where: { id: 1 }, select: { aiEnabled: true } }),
    db.aiChat.findMany({ where: { userId: user.id }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true, updatedAt: true } }),
  ]);
  const chat = chatId ? await db.aiChat.findFirst({ where: { id: chatId, userId: user.id } }) : null;
  const messages = (Array.isArray(chat?.messages) ? chat.messages : []) as unknown as Stored[];
  const ready = aiConfigured() && settings?.aiEnabled;

  return (
    <div>
      <PageHeader
        title="Copilot"
        subtitle="Your AI assistant for Kudu, powered by Claude. It looks up your records to answer, and drafts messages for you to send."
        actions={<Link href="/copilot" className="btn-outline">+ New chat</Link>}
      />
      {!aiConfigured() && (
        <Flash
          tone="error"
          message={`The copilot is not set up yet. ${can(user, "settings.manage") ? "Add ANTHROPIC_API_KEY (from platform.claude.com) in Vercel → Settings → Environment Variables, then redeploy." : "Ask an admin to add the Claude API key."}`}
        />
      )}
      {aiConfigured() && !settings?.aiEnabled && <Flash tone="error" message="The copilot is switched off under Settings → AI copilot." />}

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="min-w-0">{ready ? <CopilotChat key={chat?.id ?? "new"} chatId={chat?.id ?? ""} turns={turnsOf(messages)} ask={chat ? undefined : ask} closed={messages.length >= MAX_MESSAGES} /> : null}</div>
        <aside className="order-first lg:order-none">
          <div className="card p-3 text-sm">
            <div className="mb-2 text-xs font-semibold tracking-wide text-charcoal-500 uppercase">Your chats</div>
            {chats.length === 0 ? (
              <p className="text-xs text-charcoal-500">None yet. Only you can see your chats.</p>
            ) : (
              <ul className="max-h-60 space-y-0.5 overflow-y-auto lg:max-h-none">
                {chats.map((c) => (
                  <li key={c.id}>
                    <Link href={`/copilot?chat=${c.id}`} className={`block truncate rounded px-2 py-1 ${c.id === chat?.id ? "bg-kudu-50 font-medium text-kudu-700" : "hover:bg-charcoal-50"}`} title={c.title}>
                      {c.title}
                      <span className="block text-[11px] font-normal text-charcoal-400">{fmtDate(c.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {chat && (
              <form action={deleteChat} className="mt-3 border-t border-charcoal-100 pt-2">
                <input type="hidden" name="id" value={chat.id} />
                <ConfirmButton message="Delete this chat?" className="text-xs text-charcoal-500 hover:text-kudu-700">Delete this chat</ConfirmButton>
              </form>
            )}
          </div>
          <p className="mt-3 px-1 text-xs text-charcoal-500">Answers can be wrong. Check figures before you send them to a customer.</p>
        </aside>
      </div>
    </div>
  );
}
