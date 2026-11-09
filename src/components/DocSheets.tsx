import type { Branch, Customer, Invoice, InvoiceItem, Quotation, QuotationItem, Settings } from "@prisma/client";
import { fmtDate } from "@/lib/format";
import { branchContact } from "@/components/Document";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DocLayout } from "@/components/DocLayouts";
import { layoutId, parseDocStyle, type DocData } from "@/lib/docLayout";

type WithCustomer = { customer: Customer & { branch: Branch | null } };

/** Company details and banking as printed on documents (the branch's contact details win where filled in). */
export function companyForDocs(settings: Settings, branch?: Branch | null): DocData["company"] {
  const c = branchContact(settings, branch);
  return {
    name: settings.companyName,
    address: c.address,
    phone: c.phone,
    email: c.email,
    website: settings.website,
    vatNumber: settings.vatNumber,
    regNumber: settings.regNumber,
    branchName: branch?.name ?? "",
  };
}

export function bankForDocs(settings: Settings): DocData["bank"] {
  if (!settings.bankName && !settings.bankAccountNumber) return null;
  return {
    name: settings.bankName,
    accountName: settings.bankAccountName,
    accountNumber: settings.bankAccountNumber,
    branchCode: settings.bankBranchCode,
  };
}

function customerForDocs(customer: Customer, siteAddress = ""): DocData["customer"] {
  return {
    name: customer.name,
    contactPerson: customer.contactPerson,
    email: customer.email,
    phone: customer.phone,
    vatNumber: customer.vatNumber,
    billingAddress: customer.billingAddress,
    siteAddress: siteAddress || customer.siteAddress,
  };
}

function Sheet({ doc, settings, layout, className }: { doc: DocData; settings: Settings; layout: string; className: string }) {
  return (
    <article className={`print-sheet card p-8 ${className}`}>
      <DocLayout
        layout={layoutId(layout)}
        doc={doc}
        style={parseDocStyle(settings.docStyle)}
        logo={<CompanyLogo logo={settings.logo} name={settings.companyName} className="h-full w-auto" />}
      />
    </article>
  );
}

/** The quotation as printed, in the company's chosen quotation layout. Shared by the staff page and the customer portal. */
export function QuotationSheet({ q, settings }: { q: Quotation & WithCustomer & { items: QuotationItem[] }; settings: Settings }) {
  const doc: DocData = {
    kind: "quote",
    number: q.number,
    meta: [
      ["Date", fmtDate(q.issueDate)],
      ["Valid until", fmtDate(q.validUntil)],
    ],
    heading: q.title,
    company: companyForDocs(settings, q.customer.branch),
    customer: customerForDocs(q.customer, q.siteAddress),
    items: q.items,
    totals: { subtotal: q.subtotal, discount: q.discount, vatRate: q.vatRate, vatAmount: q.vatAmount, total: q.total, paid: 0 },
    notes: q.notes,
    terms: q.terms,
    bank: bankForDocs(settings),
    symbol: settings.currencySymbol,
  };
  return <Sheet doc={doc} settings={settings} layout={settings.quoteLayout} className="mx-auto max-w-4xl" />;
}

/** The invoice as printed, in the company's chosen invoice layout. Shared by the staff page and the customer portal. */
export function InvoiceSheet({ inv, settings }: { inv: Invoice & WithCustomer & { items: InvoiceItem[] }; settings: Settings }) {
  const doc: DocData = {
    kind: "invoice",
    number: inv.number,
    meta: [
      ["Date", fmtDate(inv.issueDate)],
      ["Due date", fmtDate(inv.dueDate)],
      ...(inv.reference ? ([["Reference", inv.reference]] as [string, string][]) : []),
    ],
    heading: "",
    company: companyForDocs(settings, inv.customer.branch),
    customer: customerForDocs(inv.customer),
    items: inv.items,
    totals: { subtotal: inv.subtotal, discount: inv.discount, vatRate: inv.vatRate, vatAmount: inv.vatAmount, total: inv.total, paid: inv.amountPaid },
    notes: inv.notes,
    terms: inv.terms,
    bank: bankForDocs(settings),
    symbol: settings.currencySymbol,
  };
  return <Sheet doc={doc} settings={settings} layout={settings.invoiceLayout} className="w-full max-w-4xl" />;
}
