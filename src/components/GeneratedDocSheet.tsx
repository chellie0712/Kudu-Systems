import type { GeneratedDoc, Settings } from "@prisma/client";
import { fmtDate } from "@/lib/format";
import type { DocItem } from "@/lib/documents/defs";
import { CompanyLogo } from "./CompanyLogo";
import { DocBody } from "./DocBody";

/** A document made from a template, laid out for screen and print. */
export function GeneratedDocSheet({ doc, settings }: { doc: GeneratedDoc; settings: Settings }) {
  const items = (Array.isArray(doc.items) ? doc.items : []) as DocItem[];
  return (
    <article className="doc-sheet mx-auto max-w-3xl bg-white p-6 shadow-sm sm:p-10 print:max-w-none print:p-0 print:shadow-none">
      {doc.letterhead && (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b-4 border-kudu-600 pb-4">
          <CompanyLogo logo={settings.logo} name={settings.companyName} className="h-16 w-auto" />
          <div className="text-right text-xs leading-relaxed text-charcoal-600">
            <div className="font-semibold text-charcoal-800">{settings.companyName}</div>
            {settings.address && <div className="whitespace-pre-line">{settings.address}</div>}
            <div>{[settings.phone, settings.email, settings.website].filter(Boolean).join(" · ")}</div>
            {settings.vatNumber && <div>VAT no. {settings.vatNumber}</div>}
            {settings.pcoNumber && <div>PCO reg. {settings.pcoNumber}</div>}
          </div>
        </header>
      )}
      {doc.title && <h1 className="mb-1 text-center text-2xl font-extrabold tracking-wide text-charcoal-900 uppercase">{doc.title}</h1>}
      <div className="mb-6 text-center text-xs text-charcoal-500">
        {doc.number} · {fmtDate(doc.createdAt)}
      </div>
      <DocBody
        body={doc.body}
        items={items}
        symbol={settings.currencySymbol}
        signatures={{
          client: { image: doc.clientSignature, name: doc.clientSignedName, date: doc.clientSignedAt ? fmtDate(doc.clientSignedAt) : "" },
          company: { image: doc.companySignature, name: doc.companySigner, companyName: settings.companyName },
        }}
      />
    </article>
  );
}
