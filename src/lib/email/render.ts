// Turns a campaign into the email a customer receives: HTML (table layout that works in Gmail,
// Outlook and phone mail apps) plus a plain-text version.
//
// The body is plain text with light formatting, so nobody has to write HTML:
//   blank line          new paragraph
//   # Heading           a heading
//   - item / * item     bullet list
//   **bold**            bold
//   [words](https://…)  a link; bare https://… addresses become links too
//   {{first_name}} {{customer_name}} {{company_name}} {{sender_name}}   filled in per customer

export const MERGE_FIELDS = [
  { tag: "{{first_name}}", help: "Contact's first name (\"there\" if unknown)" },
  { tag: "{{customer_name}}", help: "Customer name" },
  { tag: "{{company_name}}", help: "Your company name" },
  { tag: "{{sender_name}}", help: "Your name" },
] as const;

export type RenderInput = {
  subject: string;
  preheader: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
};

export type RenderContext = {
  customerName: string;
  contactPerson: string;
  customerType: string;
  company: { name: string; address: string; phone: string; email: string; website: string };
  senderName: string;
  logoUrl: string | null;
  unsubscribeUrl: string;
};

const CRIMSON = "#9b1530";
const CHARCOAL = "#1f2530";
const GREY = "#5d6676";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Only web and mail links; anything else (javascript: …) is dropped. */
export function safeUrl(url: string): string | null {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|tel:)/i.test(u) ? u : null;
}

export function firstName(ctx: Pick<RenderContext, "contactPerson" | "customerName" | "customerType">): string {
  const source = ctx.contactPerson.trim() || (ctx.customerType === "INDIVIDUAL" ? ctx.customerName.trim() : "");
  return source.split(/\s+/)[0] || "there";
}

export function merge(text: string, ctx: Pick<RenderContext, "contactPerson" | "customerName" | "customerType" | "company" | "senderName">): string {
  return text
    .replace(/\{\{\s*first_name\s*\}\}/gi, firstName(ctx))
    .replace(/\{\{\s*customer_name\s*\}\}/gi, ctx.customerName)
    .replace(/\{\{\s*company_name\s*\}\}/gi, ctx.company.name)
    .replace(/\{\{\s*sender_name\s*\}\}/gi, ctx.senderName);
}

/** Inline formatting of one escaped line: links and bold. */
function inline(escaped: string): string {
  const linkStyle = `color:${CRIMSON};text-decoration:underline`;
  let out = escaped.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
    const href = safeUrl(url.replace(/&amp;/g, "&"));
    return href ? `<a href="${esc(href)}" style="${linkStyle}">${label}</a>` : label;
  });
  // Bare addresses not already inside a link.
  out = out.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (m, pre: string, url: string) => `${pre}<a href="${url}" style="${linkStyle}">${url}</a>`);
  return out.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

type Block = { kind: "p" | "h" | "ul"; lines: string[] };

function blocks(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of body.replace(/\r\n?/g, "\n").split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trimEnd()).filter((l) => l.trim());
    if (!lines.length) continue;
    let para: string[] = [];
    let list: string[] = [];
    const flush = () => {
      if (para.length) out.push({ kind: "p", lines: para });
      if (list.length) out.push({ kind: "ul", lines: list });
      para = [];
      list = [];
    };
    for (const line of lines) {
      const t = line.trim();
      if (/^#{1,3}\s+/.test(t)) {
        flush();
        out.push({ kind: "h", lines: [t.replace(/^#{1,3}\s+/, "")] });
      } else if (/^[-*•]\s+/.test(t)) {
        if (para.length) { out.push({ kind: "p", lines: para }); para = []; }
        list.push(t.replace(/^[-*•]\s+/, ""));
      } else {
        if (list.length) { out.push({ kind: "ul", lines: list }); list = []; }
        para.push(t);
      }
    }
    flush();
  }
  return out;
}

function bodyHtml(body: string): string {
  const p = `margin:0 0 16px;font-size:15px;line-height:1.6;color:${CHARCOAL}`;
  return blocks(body)
    .map((b) => {
      if (b.kind === "h") return `<h2 style="margin:8px 0 12px;font-size:19px;line-height:1.3;color:${CHARCOAL}">${inline(esc(b.lines[0]))}</h2>`;
      if (b.kind === "ul") {
        return `<ul style="margin:0 0 16px;padding-left:22px">${b.lines.map((l) => `<li style="margin:0 0 6px;font-size:15px;line-height:1.5;color:${CHARCOAL}">${inline(esc(l))}</li>`).join("")}</ul>`;
      }
      return `<p style="${p}">${b.lines.map((l) => inline(esc(l))).join("<br>")}</p>`;
    })
    .join("\n");
}

function bodyText(body: string): string {
  return body
    .replace(/\r\n?/g, "\n")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1 ($2)")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^#{1,3}\s+(.*)$/gm, (m, h: string) => h.toUpperCase())
    .replace(/^[*•]\s+/gm, "- ")
    .trim();
}

export function renderEmail(c: RenderInput, ctx: RenderContext): { subject: string; html: string; text: string } {
  const subject = merge(c.subject, ctx);
  const preheader = merge(c.preheader, ctx);
  const body = merge(c.body, ctx);
  const button = c.buttonLabel.trim() && safeUrl(c.buttonUrl) ? { label: merge(c.buttonLabel, ctx), url: safeUrl(c.buttonUrl)! } : null;
  const co = ctx.company;
  const contactBits = [co.phone, co.email, co.website].filter(Boolean);
  const header = ctx.logoUrl
    ? `<img src="${esc(ctx.logoUrl)}" alt="${esc(co.name)}" height="56" style="display:block;height:56px;width:auto;max-width:260px;border:0">`
    : `<span style="font-size:22px;font-weight:800;color:${CHARCOAL}">${esc(co.name)}</span>`;

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(preheader)}&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="padding:20px 28px;border-bottom:3px solid ${CRIMSON}">${header}</td></tr>
<tr><td style="padding:28px 28px 12px">
${bodyHtml(body)}
${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="background:${CRIMSON};border-radius:6px"><a href="${esc(button.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none">${esc(button.label)}</a></td></tr></table>` : ""}
</td></tr>
<tr><td style="background:${CHARCOAL};padding:20px 28px;font-size:12px;line-height:1.6;color:#cdd1d8">
<strong style="color:#ffffff">${esc(co.name)}</strong>${co.address ? `<br>${esc(co.address).replace(/\n/g, ", ")}` : ""}${contactBits.length ? `<br>${contactBits.map(esc).join(" &middot; ")}` : ""}
<br><br>You are receiving this email because you are a customer of ${esc(co.name)} or asked to hear from us.
<a href="${esc(ctx.unsubscribeUrl)}" style="color:#ffffff;text-decoration:underline">Unsubscribe</a> and we will not send you marketing email again.
</td></tr>
</table>
<p style="margin:12px 0 0;font-size:11px;color:${GREY}">Sent by ${esc(ctx.senderName)} at ${esc(co.name)}</p>
</td></tr></table>
</body></html>`;

  const text = [
    bodyText(body),
    button ? `${button.label}: ${button.url}` : "",
    "--",
    co.name,
    co.address.replace(/\n/g, ", "),
    contactBits.join(" | "),
    "",
    `You are receiving this email because you are a customer of ${co.name} or asked to hear from us.`,
    `Unsubscribe: ${ctx.unsubscribeUrl}`,
  ]
    .filter((l, i, a) => l !== "" || a[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
