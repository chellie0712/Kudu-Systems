/* eslint-disable @next/next/no-img-element */
// Prints a document made from a template. No hooks, so the template editor's preview (client) and
// the document page (server) both use it. Text is shown as text: nothing in a template becomes HTML.
import { Fragment } from "react";
import { boldParts, parseBody, type DocItem } from "@/lib/documents/defs";
import { money } from "@/lib/format";
import { lineTotal } from "@/lib/totals";

function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {boldParts(line).map((p, j) => (p.bold ? <strong key={j}>{p.text}</strong> : <Fragment key={j}>{p.text}</Fragment>))}
        </Fragment>
      ))}
    </>
  );
}

export type Signatures = {
  client?: { image: string | null; name: string; date: string };
  company: { image: string | null; name: string; companyName: string };
};

export function DocBody({ body, items, signatures, symbol = "R" }: { body: string; items: DocItem[]; signatures: Signatures; symbol?: string }) {
  return (
    <div className="doc-body space-y-3 text-[15px] leading-relaxed text-charcoal-800">
      {parseBody(body).map((b, i) => {
        switch (b.t) {
          case "h1":
            return <h2 key={i} className="pt-2 text-xl font-bold text-charcoal-900"><Inline text={b.text} /></h2>;
          case "h2":
            return <h3 key={i} className="border-b border-charcoal-200 pt-2 pb-1 text-sm font-bold tracking-wide text-kudu-700 uppercase"><Inline text={b.text} /></h3>;
          case "p":
            return <p key={i}><Inline text={b.text} /></p>;
          case "note":
            return <p key={i} className="rounded-md border-l-4 border-kudu-600 bg-charcoal-50 px-3 py-2 text-sm"><Inline text={b.text} /></p>;
          case "list":
            return (
              <ul key={i} className="list-disc space-y-1 pl-6">
                {b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}
              </ul>
            );
          case "rule":
            return <hr key={i} className="border-charcoal-200" />;
          case "pagebreak":
            return <div key={i} className="print-break" style={{ breakAfter: "page" }} aria-hidden />;
          case "items":
            return items.length ? (
              <table key={i} className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-charcoal-300 text-left text-xs text-charcoal-500 uppercase">
                    <th className="py-1">Description</th>
                    <th className="py-1 text-right">Qty</th>
                    <th className="py-1 text-right">Price</th>
                    <th className="py-1 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, j) => (
                    <tr key={j} className="border-b border-charcoal-100 align-top">
                      <td className="py-1 pr-2 whitespace-pre-line">{it.description}</td>
                      <td className="py-1 text-right tabular-nums">{it.quantity}{it.unit ? ` ${it.unit}` : ""}</td>
                      <td className="py-1 text-right tabular-nums">{money(it.unitPrice, symbol)}</td>
                      <td className="py-1 text-right tabular-nums">{money(lineTotal(it), symbol)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p key={i} className="text-sm text-charcoal-500 italic">(No line items.)</p>
            );
          case "signatures":
            return (
              <div key={i} className="grid gap-8 pt-6 sm:grid-cols-2 print:grid-cols-2" style={{ breakInside: "avoid" }}>
                <SignBox
                  label="For the client"
                  image={signatures.client?.image ?? null}
                  name={signatures.client?.name ?? ""}
                  date={signatures.client?.date ?? ""}
                />
                <SignBox label={`For ${signatures.company.companyName}`} image={signatures.company.image} name={signatures.company.name} date="" />
              </div>
            );
        }
      })}
    </div>
  );
}

function SignBox({ label, image, name, date }: { label: string; image: string | null; name: string; date: string }) {
  return (
    <div>
      <div className="flex h-20 items-end border-b border-charcoal-400">{image && <img src={image} alt={`Signature: ${name}`} className="max-h-20 w-auto" />}</div>
      <div className="mt-1 text-xs text-charcoal-600">
        {label}
        {name && <>: <span className="font-semibold text-charcoal-800">{name}</span></>}
        {date && <> · {date}</>}
      </div>
    </div>
  );
}
