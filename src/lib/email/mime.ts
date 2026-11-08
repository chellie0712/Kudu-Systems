import { randomBytes } from "node:crypto";

// Builds a complete RFC 5322 message. The same message goes to Gmail (raw), Microsoft Graph
// (MIME upload) and SMTP (raw), so all three send exactly the same headers, including the
// List-Unsubscribe headers that Gmail and Yahoo require for marketing mail.

export type Address = { email: string; name?: string };

export type MailMessage = {
  from: Address;
  to: Address;
  replyTo?: Address;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
};

const CRLF = "\r\n";

/** RFC 2047 encoded-word for header text that is not plain ASCII. */
export function encodeHeader(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  // Encoded words may be at most 75 characters, so split long text (never inside a character).
  const words: string[] = [];
  let chunk = "";
  for (const ch of value) {
    if (Buffer.byteLength(chunk + ch, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

export function formatAddress(a: Address): string {
  const email = a.email.trim();
  if (!a.name?.trim()) return email;
  const name = a.name.replace(/[\r\n]+/g, " ").trim();
  const display = /^[\x20-\x7e]*$/.test(name) ? `"${name.replace(/(["\\])/g, "\\$1")}"` : encodeHeader(name);
  return `${display} <${email}>`;
}

/** Base64 body, wrapped at 76 characters as MIME requires. */
function b64(body: string): string {
  return (Buffer.from(body, "utf8").toString("base64").match(/.{1,76}/g) ?? []).join(CRLF);
}

const clean = (v: string) => v.replace(/[\r\n]+/g, " ");

export function buildMime(m: MailMessage): string {
  const boundary = `kudu_${randomBytes(12).toString("hex")}`;
  const domain = m.from.email.split("@")[1] || "kudu.local";
  const headers: [string, string][] = [
    ["From", formatAddress(m.from)],
    ["To", formatAddress(m.to)],
    ...(m.replyTo ? [["Reply-To", formatAddress(m.replyTo)] as [string, string]] : []),
    ["Subject", encodeHeader(clean(m.subject))],
    ["Date", new Date().toUTCString().replace("GMT", "+0000")],
    ["Message-ID", `<${randomBytes(16).toString("hex")}@${domain}>`],
    ["MIME-Version", "1.0"],
    ...Object.entries(m.headers ?? {}).map(([k, v]) => [k, clean(v)] as [string, string]),
    ["Content-Type", `multipart/alternative; boundary="${boundary}"`],
  ];
  return [
    ...headers.map(([k, v]) => `${k}: ${v}`),
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.html),
    `--${boundary}--`,
    "",
  ].join(CRLF);
}
