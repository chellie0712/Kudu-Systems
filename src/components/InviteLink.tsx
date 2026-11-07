"use client";

import { useEffect, useState } from "react";

/** The portal link to send a customer, with copy, WhatsApp and email buttons (no email service needed). */
export function InviteLink({ path, name, companyName, expires }: { path: string; name: string; companyName: string; expires: string }) {
  const [url, setUrl] = useState(path);
  const [copied, setCopied] = useState(false);
  useEffect(() => setUrl(window.location.origin + path), [path]);
  const text = `Hi ${name || "there"}, here is your link to the ${companyName} customer portal, where you can see your quotes, service certificates and invoices. Open it to choose your password (valid until ${expires}): ${url}`;
  return (
    <div className="mt-2 space-y-2 rounded-md bg-charcoal-50 p-3">
      <input readOnly value={url} className="input font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label="Portal link" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-outline py-1 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(url).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a className="btn-outline py-1 text-xs" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(text)}`}>Send by WhatsApp</a>
        <a className="btn-outline py-1 text-xs" href={`mailto:?subject=${encodeURIComponent(`${companyName} customer portal`)}&body=${encodeURIComponent(text)}`}>Send by email</a>
      </div>
      <p className="text-xs text-charcoal-500">Valid until {expires}. Anyone with this link can set the password, so send it only to {name || "the customer"}.</p>
    </div>
  );
}
