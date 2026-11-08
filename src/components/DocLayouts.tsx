// The five quotation/invoice layouts. Pure components (no server-only imports), so the
// same code prints the real documents and draws the live previews in Settings.
import type { CSSProperties, ReactNode } from "react";
import { money } from "@/lib/format";
import { lineTotal } from "@/lib/totals";
import { FONTS, docTitle, type DocData, type DocStyle, type LayoutId } from "@/lib/docLayout";

type Props = { doc: DocData; style: DocStyle; logo: ReactNode };

/** Renders a quotation or invoice in the chosen layout. */
export function DocLayout({ layout, ...p }: Props & { layout: LayoutId }) {
  const L = { classic: Classic, statement: Statement, modern: Modern, minimal: Minimal, boxed: Boxed }[layout] ?? Classic;
  const vars = { "--acc": p.style.accent, fontFamily: FONTS[p.style.font].css } as CSSProperties;
  return (
    <div className="doc-sheet text-charcoal-800" style={vars}>
      <L {...p} />
    </div>
  );
}

// ---------- shared pieces ----------

const logoHeight = { s: "h-12", m: "h-20", l: "h-28" } as const;

function Logo({ style, logo, className = "" }: { style: DocStyle; logo: ReactNode; className?: string }) {
  return <div className={`${logoHeight[style.logoSize]} flex shrink-0 items-center [&_img]:h-full [&_img]:w-auto ${className}`}>{logo}</div>;
}

/** Row direction for a header whose logo sits on `natural` unless the company moved it. */
function logoRow(style: DocStyle, natural: "left" | "right") {
  const side = style.logoSide === "auto" ? natural : style.logoSide;
  return side === natural ? "flex-row" : "flex-row-reverse";
}

function Lines({ text, className = "" }: { text: string; className?: string }) {
  return text ? <div className={`whitespace-pre-line ${className}`}>{text}</div> : null;
}

function Description({ text, style }: { text: string; style: DocStyle }) {
  if (!style.itemHeadings) return <span className="whitespace-pre-line">{text}</span>;
  const [first, ...rest] = text.split("\n");
  return (
    <>
      <span className="font-semibold">{first}</span>
      {rest.length > 0 && <span className="mt-0.5 block whitespace-pre-line text-[0.92em] italic text-charcoal-600">{rest.join("\n")}</span>}
    </>
  );
}

const qty = (i: DocData["items"][number], style: DocStyle) => `${i.quantity}${style.showUnits && i.unit ? ` ${i.unit}` : ""}`;
const incl = (i: DocData["items"][number], vatRate: number) => Math.round(lineTotal(i) * (1 + vatRate / 100));

type Col = { head: string; cell: (i: DocData["items"][number]) => ReactNode; right?: boolean; strong?: boolean };

/** Item columns after Description; VAT columns only when switched on. */
function columns(doc: DocData, style: DocStyle): Col[] {
  const s = doc.symbol;
  const cols: Col[] = [
    { head: "Qty", cell: (i) => qty(i, style), right: true },
    { head: "Unit price", cell: (i) => money(i.unitPrice, s), right: true },
  ];
  if (style.lineVat) {
    cols.push(
      { head: "VAT %", cell: () => `${doc.totals.vatRate}%`, right: true },
      { head: "Excl. total", cell: (i) => money(lineTotal(i), s), right: true },
      { head: "Incl. total", cell: (i) => money(incl(i, doc.totals.vatRate), s), right: true, strong: true },
    );
  } else {
    cols.push({ head: "Amount", cell: (i) => money(lineTotal(i), s), right: true, strong: true });
  }
  return cols;
}

function totalsRows(doc: DocData): [string, number][] {
  const t = doc.totals;
  return [
    ["Subtotal", t.subtotal],
    ...(t.discount > 0 ? ([["Discount", -t.discount]] as [string, number][]) : []),
    [`VAT (${t.vatRate}%)`, t.vatAmount],
  ];
}

const showBank = (doc: DocData, style: DocStyle) => !!doc.bank && (doc.kind === "invoice" || style.quoteBanking);
const balance = (doc: DocData) => doc.totals.total - doc.totals.paid;
const amt = (v: number, s: string) => (v < 0 ? `− ${money(-v, s)}` : money(v, s));

function BankLines({ doc }: { doc: DocData }) {
  const b = doc.bank!;
  return (
    <>
      {b.name && <div>Bank: {b.name}</div>}
      {b.accountName && <div>Account name: {b.accountName}</div>}
      {b.accountNumber && <div>Account no.: {b.accountNumber}</div>}
      {b.branchCode && <div>Branch code: {b.branchCode}</div>}
      <div>Reference: {doc.number}</div>
    </>
  );
}

function companyLines(doc: DocData, style: DocStyle) {
  const c = doc.company;
  return { contactLine: [c.phone, c.email, c.website].filter(Boolean).join(" · "), contact: style.contactPerson };
}

function Signature({ doc, style, className = "" }: { doc: DocData; style: DocStyle; className?: string }) {
  if (doc.kind !== "quote" || !style.quoteSignature) return null;
  return (
    <div className={`grid grid-cols-2 gap-8 pt-6 break-inside-avoid ${className}`}>
      <div className="border-t border-charcoal-400 pt-1 text-xs text-charcoal-500">Accepted by (name &amp; signature)</div>
      <div className="border-t border-charcoal-400 pt-1 text-xs text-charcoal-500">Date</div>
    </div>
  );
}

function NotesTerms({ doc, labelClass }: { doc: DocData; labelClass: string }) {
  return (
    <>
      {doc.notes && (
        <div className="break-inside-avoid">
          <div className={labelClass}>Notes</div>
          <p className="whitespace-pre-line text-sm">{doc.notes}</p>
        </div>
      )}
      {doc.terms && (
        <div className="break-inside-avoid">
          <div className={labelClass}>Terms &amp; conditions</div>
          <p className="whitespace-pre-line text-xs text-charcoal-600">{doc.terms}</p>
        </div>
      )}
    </>
  );
}

function Footer({ style, className = "" }: { style: DocStyle; className?: string }) {
  return style.footer ? <p className={`whitespace-pre-line text-center text-xs text-charcoal-500 ${className}`}>{style.footer}</p> : null;
}

function Empty({ span }: { span: number }) {
  return (
    <tr>
      <td colSpan={span} className="px-3 py-6 text-center text-charcoal-400">No line items</td>
    </tr>
  );
}

// ---------- 1. Classic (the original layout) ----------

function Classic({ doc, style, logo }: Props) {
  const c = doc.company;
  const cols = columns(doc, style);
  const { contactLine, contact } = companyLines(doc, style);
  const label = "mb-1 text-xs font-bold uppercase tracking-wide text-[var(--acc)]";
  return (
    <div className="space-y-6">
      <div className={`flex flex-wrap items-start justify-between gap-6 border-b-4 border-[var(--acc)] pb-5 ${logoRow(style, "left")}`}>
        <div className="space-y-2">
          <Logo style={style} logo={logo} />
          <div className="text-xs leading-relaxed text-charcoal-600">
            <div className="font-semibold text-charcoal-800">{c.name}</div>
            {c.branchName && <div className="font-medium text-charcoal-700">{c.branchName} branch</div>}
            <Lines text={c.address} />
            {contactLine}
            {contact && <div>Contact: {contact}</div>}
            {c.vatNumber && <div>VAT no. {c.vatNumber}</div>}
            {c.regNumber && <div>Reg. no. {c.regNumber}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold uppercase tracking-wider text-charcoal-800">{docTitle(doc, style)}</div>
          <div className="text-lg font-bold text-[var(--acc)]">{doc.number}</div>
          <table className="mt-2 ml-auto text-sm">
            <tbody>
              {doc.meta.map(([k, v]) => (
                <tr key={k}>
                  <td className="pr-3 text-right text-charcoal-500">{k}</td>
                  <td className="text-right font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <div className={label}>{doc.kind === "quote" ? "Quotation for" : "Bill to"}</div>
          <div className="font-semibold">{doc.customer.name}</div>
          {doc.customer.contactPerson && <div className="text-sm">Attn: {doc.customer.contactPerson}</div>}
          <Lines text={doc.customer.billingAddress} className="text-sm" />
          <div className="text-sm text-charcoal-600">{[doc.customer.phone, doc.customer.email].filter(Boolean).join(" · ")}</div>
          {doc.customer.vatNumber && <div className="text-sm text-charcoal-600">VAT no. {doc.customer.vatNumber}</div>}
        </div>
        {doc.kind === "quote" && doc.customer.siteAddress && (
          <div>
            <div className={label}>Site</div>
            <Lines text={doc.customer.siteAddress} className="text-sm" />
          </div>
        )}
      </div>
      {doc.heading && <h2 className="text-lg font-semibold">{doc.heading}</h2>}
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-charcoal-800 text-left text-xs uppercase tracking-wide text-white">
            <th className="px-3 py-2">Description</th>
            {cols.map((col) => <th key={col.head} className="px-3 py-2 text-right">{col.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i) => (
            <tr key={i.id} className="border-b border-charcoal-100 align-top">
              <td className="px-3 py-2"><Description text={i.description} style={style} /></td>
              {cols.map((col) => <td key={col.head} className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{col.cell(i)}</td>)}
            </tr>
          ))}
          {doc.items.length === 0 && <Empty span={cols.length + 1} />}
        </tbody>
      </table>
      <table className="ml-auto w-full max-w-xs text-sm break-inside-avoid">
        <tbody>
          {totalsRows(doc).map(([k, v]) => (
            <tr key={k}><td className="py-1">{k}</td><td className="py-1 text-right tabular-nums">{amt(v, doc.symbol)}</td></tr>
          ))}
          <tr className="border-t-2 border-charcoal-800 text-base font-bold">
            <td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{money(doc.totals.total, doc.symbol)}</td>
          </tr>
          {doc.totals.paid > 0 && (
            <>
              <tr><td className="py-1">Paid</td><td className="py-1 text-right tabular-nums">{money(doc.totals.paid, doc.symbol)}</td></tr>
              <tr className="font-bold text-[var(--acc)]"><td className="py-1">Balance due</td><td className="py-1 text-right tabular-nums">{money(balance(doc), doc.symbol)}</td></tr>
            </>
          )}
        </tbody>
      </table>
      <NotesTerms doc={doc} labelClass="label" />
      {showBank(doc, style) && (
        <div className="rounded-md bg-charcoal-50 p-4 text-sm break-inside-avoid">
          <div className={label}>Banking details</div>
          <BankLines doc={doc} />
        </div>
      )}
      <Signature doc={doc} style={style} />
      <Footer style={style} className="border-t border-charcoal-100 pt-3" />
    </div>
  );
}

// ---------- 2. Statement (details left, logo right, FROM / TO, banking + totals footer) ----------

function Statement({ doc, style, logo }: Props) {
  const c = doc.company;
  const cu = doc.customer;
  const cols = columns(doc, style);
  const head = "text-[11px] font-bold uppercase text-charcoal-500";
  const meta: [string, string][] = [
    ["Number", doc.number],
    ...doc.meta,
    ...(c.regNumber ? ([["Comp reg", c.regNumber]] as [string, string][]) : []),
    ...(c.phone ? ([["Contact num", c.phone]] as [string, string][]) : []),
    ...(c.email ? ([["Email", c.email]] as [string, string][]) : []),
  ];
  return (
    <div className="space-y-6 text-[13px]">
      <div className={`flex items-start justify-between gap-6 ${logoRow(style, "right")}`}>
        <div className="min-w-0">
          <div className="text-3xl font-extrabold uppercase text-charcoal-900">{docTitle(doc, style)}</div>
          <table className="mt-2 text-xs text-charcoal-600">
            <tbody>
              {meta.map(([k, v], n) => (
                <tr key={k}>
                  <td className="pr-6 uppercase">{k}:</td>
                  <td className={`text-right ${n === 0 || k === "Date" ? "font-bold text-charcoal-800" : ""}`}>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Logo style={style} logo={logo} />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <div className="text-xs font-bold uppercase text-charcoal-400">From</div>
          <div className="text-lg font-extrabold uppercase text-charcoal-900">{c.name}</div>
          {c.branchName && <div className="text-xs font-semibold">{c.branchName} branch</div>}
          <div className={head}>VAT no: <span className="font-normal normal-case text-charcoal-700">{c.vatNumber}</span></div>
          {style.contactPerson && (
            <>
              <div className={head}>Contact person:</div>
              <div className="uppercase text-charcoal-700">{style.contactPerson}</div>
            </>
          )}
          {c.address && (
            <>
              <div className={`${head} mt-1`}>Address:</div>
              <Lines text={c.address} className="text-charcoal-700" />
            </>
          )}
        </div>
        <div>
          <div className="text-xs font-bold uppercase text-charcoal-400">To</div>
          <div className="text-lg font-extrabold uppercase text-charcoal-900">{cu.name}</div>
          <div className={head}>Customer VAT no: <span className="font-normal normal-case text-charcoal-700">{cu.vatNumber}</span></div>
          <div className="grid grid-cols-2 gap-x-4 text-charcoal-700">
            <div className="uppercase">{cu.contactPerson}</div>
            <div>{cu.phone}</div>
            <div className="col-span-2 break-all uppercase">{cu.email}</div>
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-4">
            <div>
              <div className={head}>Billing address:</div>
              <Lines text={cu.billingAddress} className="text-charcoal-700" />
            </div>
            {cu.siteAddress && (
              <div>
                <div className={head}>Physical address:</div>
                <Lines text={cu.siteAddress} className="text-charcoal-700" />
              </div>
            )}
          </div>
        </div>
      </div>

      {doc.heading && <div className="font-semibold">{doc.heading}</div>}
      <table className="w-full">
        <thead>
          <tr className="border-y-2 border-charcoal-200 text-xs italic text-charcoal-400">
            <th className="py-1.5 text-left font-normal">Description</th>
            {cols.map((col) => <th key={col.head} className="py-1.5 pl-3 text-right font-normal">{col.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i) => (
            <tr key={i.id} className="border-b border-charcoal-100 align-top">
              <td className="py-2.5 italic"><Description text={i.description} style={style} /></td>
              {cols.map((col) => (
                <td key={col.head} className={`py-2.5 pl-3 text-right tabular-nums whitespace-nowrap ${col.strong ? "font-bold" : ""}`}>{col.cell(i)}</td>
              ))}
            </tr>
          ))}
          {doc.items.length === 0 && <Empty span={cols.length + 1} />}
        </tbody>
      </table>

      <NotesTerms doc={doc} labelClass="text-xs font-bold uppercase text-charcoal-500" />

      <div className="grid grid-cols-2 gap-8 border-t-2 border-charcoal-200 pt-4 break-inside-avoid">
        <div className="text-xs leading-relaxed text-charcoal-700">
          {showBank(doc, style) && (
            <>
              <div className="mb-2">Banking details:</div>
              <BankLines doc={doc} />
            </>
          )}
        </div>
        <div>
          <table className="ml-auto w-full max-w-64 text-xs">
            <tbody>
              {doc.totals.discount > 0 && <tr><td>Total discount:</td><td className="text-right font-bold tabular-nums">{money(doc.totals.discount, doc.symbol)}</td></tr>}
              <tr><td>Total exclusive:</td><td className="text-right font-bold tabular-nums">{money(doc.totals.subtotal - doc.totals.discount, doc.symbol)}</td></tr>
              <tr><td>Total VAT:</td><td className="text-right font-bold tabular-nums">{money(doc.totals.vatAmount, doc.symbol)}</td></tr>
              <tr><td className="pt-3">Grand total:</td><td className="pt-3 text-right font-bold tabular-nums">{money(doc.totals.total, doc.symbol)}</td></tr>
              {doc.totals.paid > 0 && <tr><td>Paid:</td><td className="text-right font-bold tabular-nums">{money(doc.totals.paid, doc.symbol)}</td></tr>}
            </tbody>
          </table>
          <div className="mt-4 text-right">
            <div className="text-xs font-bold uppercase text-charcoal-400">{doc.kind === "invoice" ? "Balance due" : "Total due"}</div>
            <div className="text-2xl font-extrabold tabular-nums text-[var(--acc)]">{money(balance(doc), doc.symbol)}</div>
          </div>
        </div>
      </div>
      <Signature doc={doc} style={style} />
      <Footer style={style} />
    </div>
  );
}

// ---------- 3. Modern (colour band, tinted cards, striped rows) ----------

function Modern({ doc, style, logo }: Props) {
  const c = doc.company;
  const cu = doc.customer;
  const cols = columns(doc, style);
  const { contactLine, contact } = companyLines(doc, style);
  const tint = "bg-[color-mix(in_srgb,var(--acc)_7%,white)]";
  const label = "mb-1 text-[11px] font-bold uppercase tracking-widest text-[var(--acc)]";
  return (
    <div className="space-y-6">
      <div className={`flex items-center justify-between gap-6 rounded-xl bg-[var(--acc)] p-5 text-white ${logoRow(style, "left")}`}>
        <div className="rounded-lg bg-white p-2"><Logo style={style} logo={logo} /></div>
        <div className="text-right">
          <div className="text-3xl font-light uppercase tracking-[0.2em]">{docTitle(doc, style)}</div>
          <div className="mt-1 text-lg font-bold">{doc.number}</div>
          <div className="mt-1 text-xs opacity-90">{doc.meta.map(([k, v]) => `${k}: ${v}`).join("   ·   ")}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className={`rounded-lg p-4 ${tint}`}>
          <div className={label}>From</div>
          <div className="font-semibold">{c.name}{c.branchName && ` · ${c.branchName}`}</div>
          <Lines text={c.address} className="text-charcoal-600" />
          <div className="text-charcoal-600">{contactLine}</div>
          {contact && <div className="text-charcoal-600">Contact: {contact}</div>}
          <div className="text-xs text-charcoal-500">{[c.vatNumber && `VAT ${c.vatNumber}`, c.regNumber && `Reg ${c.regNumber}`].filter(Boolean).join(" · ")}</div>
        </div>
        <div className={`rounded-lg p-4 ${tint}`}>
          <div className={label}>{doc.kind === "quote" ? "Prepared for" : "Bill to"}</div>
          <div className="font-semibold">{cu.name}</div>
          {cu.contactPerson && cu.contactPerson !== cu.name && <div>Attn: {cu.contactPerson}</div>}
          <Lines text={cu.billingAddress} className="text-charcoal-600" />
          <div className="text-charcoal-600">{[cu.phone, cu.email].filter(Boolean).join(" · ")}</div>
          {cu.vatNumber && <div className="text-xs text-charcoal-500">VAT {cu.vatNumber}</div>}
          {cu.siteAddress && cu.siteAddress !== cu.billingAddress && (
            <div className="mt-2 text-xs text-charcoal-500"><span className="font-semibold">Site:</span> {cu.siteAddress.replace(/\n/g, ", ")}</div>
          )}
        </div>
      </div>
      {doc.heading && <h2 className="text-lg font-semibold text-[var(--acc)]">{doc.heading}</h2>}
      <table className="w-full overflow-hidden rounded-lg text-sm">
        <thead>
          <tr className="border-b-2 border-[var(--acc)] text-left text-[11px] uppercase tracking-widest text-[var(--acc)]">
            <th className="px-3 py-2">Description</th>
            {cols.map((col) => <th key={col.head} className="px-3 py-2 text-right">{col.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i, n) => (
            <tr key={i.id} className={`align-top ${n % 2 ? tint : ""}`}>
              <td className="px-3 py-2.5"><Description text={i.description} style={style} /></td>
              {cols.map((col) => (
                <td key={col.head} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${col.strong ? "font-semibold" : ""}`}>{col.cell(i)}</td>
              ))}
            </tr>
          ))}
          {doc.items.length === 0 && <Empty span={cols.length + 1} />}
        </tbody>
      </table>
      <div className="flex flex-wrap items-start justify-between gap-6 break-inside-avoid">
        <div className="text-sm">
          {showBank(doc, style) && (
            <div className={`rounded-lg p-4 ${tint}`}>
              <div className={label}>Banking details</div>
              <BankLines doc={doc} />
            </div>
          )}
        </div>
        <div className="w-full max-w-xs text-sm">
          {totalsRows(doc).map(([k, v]) => (
            <div key={k} className="flex justify-between px-4 py-1"><span>{k}</span><span className="tabular-nums">{amt(v, doc.symbol)}</span></div>
          ))}
          {doc.totals.paid > 0 && (
            <div className="flex justify-between px-4 py-1"><span>Paid</span><span className="tabular-nums">− {money(doc.totals.paid, doc.symbol)}</span></div>
          )}
          <div className="mt-2 flex items-center justify-between rounded-lg bg-[var(--acc)] px-4 py-3 text-white">
            <span className="text-xs font-bold uppercase tracking-widest">{doc.totals.paid > 0 ? "Balance due" : "Total"}</span>
            <span className="text-xl font-bold tabular-nums">{money(balance(doc), doc.symbol)}</span>
          </div>
        </div>
      </div>
      <NotesTerms doc={doc} labelClass={label} />
      <Signature doc={doc} style={style} />
      <Footer style={style} className="rounded-lg bg-charcoal-50 p-3" />
    </div>
  );
}

// ---------- 4. Minimal (white space, hairlines) ----------

function Minimal({ doc, style, logo }: Props) {
  const c = doc.company;
  const cu = doc.customer;
  const cols = columns(doc, style);
  const { contactLine, contact } = companyLines(doc, style);
  const label = "mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-charcoal-400";
  return (
    <div className="space-y-10 text-sm">
      <div className={`flex items-start justify-between gap-6 ${logoRow(style, "left")}`}>
        <Logo style={style} logo={logo} />
        <div className="text-right text-xs leading-relaxed text-charcoal-500">
          <div className="text-sm font-semibold text-charcoal-800">{c.name}</div>
          {c.branchName && <div>{c.branchName} branch</div>}
          <Lines text={c.address} />
          <div>{contactLine}</div>
          {contact && <div>{contact}</div>}
          {c.vatNumber && <div>VAT {c.vatNumber}</div>}
          {c.regNumber && <div>Reg {c.regNumber}</div>}
        </div>
      </div>
      <div>
        <div className="text-4xl font-light tracking-tight text-charcoal-900">{docTitle(doc, style)}</div>
        <div className="mt-1 h-0.5 w-12 bg-[var(--acc)]" />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div>
          <div className={label}>{doc.kind === "quote" ? "For" : "Billed to"}</div>
          <div className="font-medium">{cu.name}</div>
          {cu.contactPerson && cu.contactPerson !== cu.name && <div className="text-charcoal-600">{cu.contactPerson}</div>}
          <Lines text={cu.billingAddress} className="text-charcoal-600" />
          <div className="text-charcoal-600">{[cu.phone, cu.email].filter(Boolean).join(" · ")}</div>
          {cu.vatNumber && <div className="text-charcoal-600">VAT {cu.vatNumber}</div>}
        </div>
        <div>
          {cu.siteAddress && (
            <>
              <div className={label}>Site</div>
              <Lines text={cu.siteAddress} className="text-charcoal-600" />
            </>
          )}
        </div>
        <div className="space-y-2 text-right">
          <div>
            <div className={label}>Number</div>
            <div className="font-medium">{doc.number}</div>
          </div>
          {doc.meta.map(([k, v]) => (
            <div key={k}>
              <div className={label}>{k}</div>
              <div>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {doc.heading && <div className="text-base text-charcoal-700">{doc.heading}</div>}
      <table className="w-full">
        <thead>
          <tr className="border-b border-charcoal-200">
            <th className={`${label} pb-2 text-left`}>Description</th>
            {cols.map((col) => <th key={col.head} className={`${label} pb-2 pl-3 text-right`}>{col.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i) => (
            <tr key={i.id} className="border-b border-charcoal-100 align-top">
              <td className="py-3"><Description text={i.description} style={style} /></td>
              {cols.map((col) => <td key={col.head} className="py-3 pl-3 text-right tabular-nums whitespace-nowrap">{col.cell(i)}</td>)}
            </tr>
          ))}
          {doc.items.length === 0 && <Empty span={cols.length + 1} />}
        </tbody>
      </table>
      <div className="ml-auto w-full max-w-xs space-y-1 break-inside-avoid">
        {totalsRows(doc).map(([k, v]) => (
          <div key={k} className="flex justify-between text-charcoal-600"><span>{k}</span><span className="tabular-nums">{amt(v, doc.symbol)}</span></div>
        ))}
        <div className="flex justify-between border-t border-charcoal-800 pt-2 text-base font-semibold">
          <span>Total</span><span className="tabular-nums">{money(doc.totals.total, doc.symbol)}</span>
        </div>
        {doc.totals.paid > 0 && (
          <>
            <div className="flex justify-between text-charcoal-600"><span>Paid</span><span className="tabular-nums">{money(doc.totals.paid, doc.symbol)}</span></div>
            <div className="flex justify-between font-semibold text-[var(--acc)]"><span>Balance due</span><span className="tabular-nums">{money(balance(doc), doc.symbol)}</span></div>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-8">
        <div className="space-y-4"><NotesTerms doc={doc} labelClass={label} /></div>
        {showBank(doc, style) && (
          <div className="text-xs leading-relaxed text-charcoal-600 break-inside-avoid">
            <div className={label}>Payment</div>
            <BankLines doc={doc} />
          </div>
        )}
      </div>
      <Signature doc={doc} style={style} />
      <Footer style={style} />
    </div>
  );
}

// ---------- 5. Boxed (centred letterhead, bordered sections) ----------

function Boxed({ doc, style, logo }: Props) {
  const c = doc.company;
  const cu = doc.customer;
  const cols = columns(doc, style);
  const { contactLine, contact } = companyLines(doc, style);
  const box = "border border-charcoal-800";
  const bar = "bg-charcoal-800 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white";
  const side = style.logoSide === "auto" ? "center" : style.logoSide;
  return (
    <div className="space-y-3 text-sm">
      <div className={`flex items-center gap-5 border-b-4 border-double border-[var(--acc)] pb-4 ${side === "center" ? "flex-col text-center" : side === "right" ? "flex-row-reverse text-right" : "flex-row"}`}>
        <Logo style={style} logo={logo} />
        <div className="text-xs leading-relaxed text-charcoal-600">
          <div className="text-xl font-extrabold uppercase tracking-wide text-charcoal-900">{c.name}</div>
          {c.branchName && <div className="font-semibold">{c.branchName} branch</div>}
          <div>{c.address.replace(/\n/g, ", ")}</div>
          <div>{contactLine}</div>
          <div>{[contact && `Contact: ${contact}`, c.vatNumber && `VAT no. ${c.vatNumber}`, c.regNumber && `Reg. no. ${c.regNumber}`].filter(Boolean).join("  ·  ")}</div>
        </div>
      </div>
      <div className="bg-[var(--acc)] py-1.5 text-center text-lg font-extrabold uppercase tracking-[0.3em] text-white">{docTitle(doc, style)}</div>
      <div className="grid grid-cols-[1fr_1fr_14rem] gap-3">
        <div className={box}>
          <div className={bar}>{doc.kind === "quote" ? "Customer" : "Bill to"}</div>
          <div className="p-3">
            <div className="font-semibold">{cu.name}</div>
            {cu.contactPerson && cu.contactPerson !== cu.name && <div>Attn: {cu.contactPerson}</div>}
            <Lines text={cu.billingAddress} />
            <div className="text-charcoal-600">{[cu.phone, cu.email].filter(Boolean).join(" · ")}</div>
            {cu.vatNumber && <div className="text-charcoal-600">VAT no. {cu.vatNumber}</div>}
          </div>
        </div>
        <div className={box}>
          <div className={bar}>Site / delivery</div>
          <div className="p-3"><Lines text={cu.siteAddress || cu.billingAddress} /></div>
        </div>
        <div className={box}>
          <table className="w-full text-xs">
            <tbody>
              {[["Number", doc.number] as [string, string], ...doc.meta].map(([k, v]) => (
                <tr key={k} className="border-b border-charcoal-800 last:border-0">
                  <td className="bg-charcoal-100 px-2 py-1.5 font-bold uppercase">{k}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {doc.heading && <div className={`${box} px-3 py-2`}><span className="font-bold">Re: </span>{doc.heading}</div>}
      <table className={`w-full ${box}`}>
        <thead>
          <tr className="bg-charcoal-800 text-[11px] uppercase tracking-wider text-white">
            <th className="px-3 py-1.5 text-left">Description</th>
            {cols.map((col) => <th key={col.head} className="border-l border-charcoal-600 px-3 py-1.5 text-right">{col.head}</th>)}
          </tr>
        </thead>
        <tbody>
          {doc.items.map((i) => (
            <tr key={i.id} className="border-b border-charcoal-300 align-top">
              <td className="px-3 py-2"><Description text={i.description} style={style} /></td>
              {cols.map((col) => <td key={col.head} className="border-l border-charcoal-300 px-3 py-2 text-right tabular-nums whitespace-nowrap">{col.cell(i)}</td>)}
            </tr>
          ))}
          {doc.items.length === 0 && <Empty span={cols.length + 1} />}
        </tbody>
      </table>
      <div className="grid grid-cols-[1fr_16rem] gap-3 break-inside-avoid">
        <div className={box}>
          <div className={bar}>{showBank(doc, style) ? "Banking details" : "Notes"}</div>
          <div className="p-3 text-xs leading-relaxed">
            {showBank(doc, style) ? <BankLines doc={doc} /> : <Lines text={doc.notes || "—"} />}
          </div>
        </div>
        <table className={`h-fit w-full text-sm ${box}`}>
          <tbody>
            {totalsRows(doc).map(([k, v]) => (
              <tr key={k} className="border-b border-charcoal-300">
                <td className="px-3 py-1.5">{k}</td><td className="px-3 py-1.5 text-right tabular-nums">{amt(v, doc.symbol)}</td>
              </tr>
            ))}
            <tr className="bg-charcoal-800 font-bold text-white">
              <td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right tabular-nums">{money(doc.totals.total, doc.symbol)}</td>
            </tr>
            {doc.totals.paid > 0 && (
              <>
                <tr className="border-b border-charcoal-300"><td className="px-3 py-1.5">Paid</td><td className="px-3 py-1.5 text-right tabular-nums">{money(doc.totals.paid, doc.symbol)}</td></tr>
                <tr className="font-bold text-[var(--acc)]"><td className="px-3 py-2">Balance due</td><td className="px-3 py-2 text-right tabular-nums">{money(balance(doc), doc.symbol)}</td></tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      {showBank(doc, style) && doc.notes && (
        <div className={`${box} break-inside-avoid`}>
          <div className={bar}>Notes</div>
          <Lines text={doc.notes} className="p-3" />
        </div>
      )}
      {doc.terms && (
        <div className={`${box} break-inside-avoid`}>
          <div className={bar}>Terms &amp; conditions</div>
          <Lines text={doc.terms} className="p-3 text-xs text-charcoal-600" />
        </div>
      )}
      <Signature doc={doc} style={style} className="pt-8" />
      <Footer style={style} className="pt-2" />
    </div>
  );
}
