import { requirePermission } from "@/auth";
import { getSettings } from "@/lib/settings";
import { saveDocLayout } from "@/app/actions/settings";
import { CompanyLogo } from "@/components/CompanyLogo";
import { bankForDocs, companyForDocs } from "@/components/DocSheets";
import { LayoutDesigner } from "@/components/LayoutDesigner";
import { Flash, PageHeader } from "@/components/ui";
import { layoutId, parseDocStyle, sampleDoc, type DocData } from "@/lib/docLayout";

export const metadata = { title: "Quote & invoice layout" };

export default async function LayoutsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requirePermission("settings.manage");
  const { msg, err } = await searchParams;
  const s = await getSettings();
  const quote = sampleDoc(companyForDocs(s), bankForDocs(s), s.currencySymbol, s.vatRate);
  const invoice: DocData = {
    ...quote,
    kind: "invoice",
    number: `${s.invoicePrefix}0042`,
    meta: [
      ["Date", "06 Nov 2026"],
      ["Due date", "06 Dec 2026"],
      ["Reference", "PO 1187"],
    ],
    heading: "",
    terms: s.invoiceTerms,
    totals: { ...quote.totals, paid: Math.round(quote.totals.total / 2) },
  };
  quote.number = `${s.quotePrefix}0042`;
  quote.terms = s.quoteTerms;

  return (
    <div>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Quote & invoice layout"
        subtitle="Pick one of five layouts for your quotations and invoices, then adjust the colour, font, logo, columns and wording. The preview uses your company details and a sample customer."
      />
      <Flash message={msg} />
      <Flash message={err} tone="error" />
      <LayoutDesigner
        quote={quote}
        invoice={invoice}
        logo={<CompanyLogo logo={s.logo} name={s.companyName} className="h-full w-auto" />}
        initial={{ quoteLayout: layoutId(s.quoteLayout), invoiceLayout: layoutId(s.invoiceLayout), style: parseDocStyle(s.docStyle) }}
        action={saveDocLayout}
      />
    </div>
  );
}
