"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

export type Turn = { role: "user" | "assistant"; text: string };
type Event = { type: "text"; text: string } | { type: "tool"; label: string } | { type: "error"; message: string } | { type: "done"; chatId: string; title: string };

const SUGGESTIONS = [
  "Which invoices are overdue, and who owes the most?",
  "What jobs are booked for this week?",
  "How did we do last month: quoted, invoiced and paid?",
  "Which quotations were sent more than a week ago with no answer?",
  "What tasks do I have that are overdue?",
];

// ---------- A small, safe Markdown reader: paragraphs, bullets, bold and links inside Kudu ----------

function inline(text: string, key: string) {
  const out: React.ReactNode[] = [];
  const re = /\[([^\]]+)\]\((\/[^)\s]*)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2] && !m[2].startsWith("//")) {
      out.push(<Link key={`${key}-${i++}`} href={m[2]} className="font-medium text-kudu-700 underline decoration-kudu-200 hover:decoration-kudu-600">{m[1]}</Link>);
    } else if (m[3]) out.push(<strong key={`${key}-${i++}`}>{m[3]}</strong>);
    else out.push(m[0]);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Answer({ text }: { text: string }) {
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="space-y-2">
      {blocks.map((b, bi) => {
        const lines = b.split("\n").filter((l) => l.trim());
        const bullet = (l: string) => /^\s*([-*•]|\d+[.)])\s+/.test(l);
        if (lines.length && lines.every(bullet)) {
          const ordered = /^\s*\d/.test(lines[0]);
          const items = lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), `${bi}-${li}`)}</li>);
          return ordered ? <ol key={bi} className="list-decimal space-y-1 pl-5">{items}</ol> : <ul key={bi} className="list-disc space-y-1 pl-5">{items}</ul>;
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l.replace(/^#+\s*/, ""), `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="text-xs text-charcoal-400 hover:text-kudu-700"
      onClick={async () => {
        await navigator.clipboard.writeText(text.trim()).catch(() => undefined);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

export function CopilotChat({ chatId: initialChat, turns: initialTurns, ask, closed }: { chatId: string; turns: Turn[]; ask?: string; closed?: boolean }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [chatId, setChatId] = useState(initialChat);
  const [input, setInput] = useState(ask ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Newer browsers return a promise from scrollIntoView; an effect must not return it.
    void end.current?.scrollIntoView({ block: "end" });
  }, [turns, status]);

  async function sendQuestion(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setError("");
    setStatus("Thinking…");
    setInput("");
    setTurns((t) => [...t, { role: "user", text: question }, { role: "assistant", text: "" }]);
    const addText = (s: string) =>
      setTurns((t) => {
        const copy = t.slice();
        copy[copy.length - 1] = { role: "assistant", text: copy[copy.length - 1].text + s };
        return copy;
      });
    try {
      const res = await fetch("/api/copilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: chatId || undefined, question }) });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? "The copilot did not answer.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let newChat = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as Event;
          if (e.type === "text") {
            setStatus("");
            addText(e.text);
          } else if (e.type === "tool") setStatus(`${e.label}…`);
          else if (e.type === "error") setError(e.message);
          else if (e.type === "done") newChat = e.chatId;
        }
      }
      if (newChat && newChat !== chatId) {
        setChatId(newChat);
        router.replace(`/copilot?chat=${newChat}`, { scroll: false });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setTurns((t) => (t.length && t[t.length - 1].role === "assistant" && !t[t.length - 1].text.trim() ? t.slice(0, -1) : t));
      setBusy(false);
      setStatus("");
    }
  }

  return (
    <div className="flex min-h-[60vh] flex-col">
      <div className="flex-1 space-y-4">
        {turns.length === 0 && (
          <div className="rounded-md border border-dashed border-charcoal-200 p-5 text-sm text-charcoal-600">
            <p className="mb-3">
              Ask about your customers, quotations, jobs, invoices, queries and tasks, or ask for a draft: a reply to a complaint, a payment reminder, wording for a quotation. The copilot only sees what you
              can see in Kudu, and the only thing it can change is adding a task when you ask.
            </p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="rounded-full border border-charcoal-200 bg-white px-3 py-1 text-xs hover:border-kudu-600 hover:text-kudu-700" onClick={() => sendQuestion(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap [overflow-wrap:anywhere] rounded-lg bg-kudu-700 px-4 py-2 text-sm text-white">{t.text}</div>
          ) : (
            <div key={i} className="max-w-[95%] [overflow-wrap:anywhere] rounded-lg border border-charcoal-100 bg-white px-4 py-3 text-sm leading-relaxed text-charcoal-800 shadow-sm">
              {t.text ? <Answer text={t.text} /> : <span className="text-charcoal-400">…</span>}
              {t.text && !(busy && i === turns.length - 1) && (
                <div className="mt-2 text-right">
                  <CopyButton text={t.text} />
                </div>
              )}
            </div>
          ),
        )}
        {status && <div className="text-xs text-charcoal-500" role="status">{status}</div>}
        {error && <div className="rounded-md bg-kudu-50 p-3 text-sm text-kudu-700" role="alert">{error}</div>}
        <div ref={end} />
      </div>

      {closed ? (
        <p className="mt-4 rounded-md bg-charcoal-50 p-3 text-sm text-charcoal-600">This chat is long. <Link href="/copilot" className="font-medium text-kudu-700">Start a new chat</Link> to keep answers quick.</p>
      ) : (
        <form
          className="sticky bottom-0 mt-4 flex gap-2 border-t border-charcoal-100 bg-charcoal-50/90 py-3 backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault();
            sendQuestion(input);
          }}
        >
          <textarea
            aria-label="Ask the copilot"
            className="input min-h-[2.75rem] flex-1 resize-y"
            rows={2}
            maxLength={4000}
            value={input}
            placeholder="Ask anything about your business…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendQuestion(input);
              }
            }}
          />
          <button className="btn-primary self-end" disabled={busy || !input.trim()}>{busy ? "…" : "Ask"}</button>
        </form>
      )}
    </div>
  );
}

/** "Ask Copilot" button for a record page, with a question already written. */
export function AskCopilot({ ask, label = "Ask Copilot" }: { ask: string; label?: string }) {
  return (
    <Link href={`/copilot?ask=${encodeURIComponent(ask)}`} className="btn-outline" title={ask}>
      ✦ {label}
    </Link>
  );
}
