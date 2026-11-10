import type { Metadata } from "next";
import { getCompanyBySlug } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { parseFields } from "@/lib/forms";
import { formStamp } from "@/lib/webforms";
import { submitWebForm } from "@/app/actions/forms";
import { PortalBrand } from "@/components/Portal";
import { FormRenderer } from "@/components/FormRenderer";

type Props = { params: Promise<{ company: string; slug: string }>; searchParams: Promise<{ done?: string; embed?: string }> };

async function load(companySlug: string, slug: string) {
  const company = await getCompanyBySlug(companySlug);
  if (!company?.active) return null;
  const db = clientForCompany(company);
  const [form, settings] = await Promise.all([
    db.form.findFirst({ where: { slug, active: true, public: true } }),
    db.settings.findUnique({ where: { id: 1 }, select: { logo: true, companyName: true, phone: true, email: true } }),
  ]);
  return form && settings ? { company, form, settings } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { company, slug } = await params;
  const x = await load(company, slug);
  return { title: x ? `${x.form.name} · ${x.settings.companyName}` : "Form" };
}

/** A published web form. No sign-in; the company comes from the address. Add ?embed=1 inside an iframe. */
export default async function WebFormPage({ params, searchParams }: Props) {
  const { company: companySlug, slug } = await params;
  const { done, embed } = await searchParams;
  const x = await load(companySlug, slug);
  const framed = embed === "1";
  const shell = (children: React.ReactNode) => (
    <div className={framed ? "bg-white p-4" : "flex min-h-screen justify-center bg-charcoal-800 px-4 py-8"}>
      <div className={framed ? "" : "w-full max-w-xl rounded-xl border-t-4 border-kudu-600 bg-white p-6 shadow-xl sm:p-8"}>{children}</div>
    </div>
  );
  if (!x) return shell(<p className="text-center text-sm">This form is not available.</p>);
  const { company, form, settings } = x;
  if (done)
    return shell(
      <div className="space-y-3 text-center">
        {!framed && <PortalBrand settings={settings} />}
        <h1 className="text-xl font-bold text-charcoal-800">{form.name}</h1>
        <p className="text-sm text-charcoal-700">{form.thankYou}</p>
      </div>,
    );
  return shell(
    <div>
      {!framed && <PortalBrand settings={settings} />}
      <h1 className="mb-1 text-xl font-bold text-charcoal-800">{form.name}</h1>
      {form.description && <p className="mb-5 text-sm text-charcoal-600">{form.description}</p>}
      <FormRenderer
        fields={parseFields(form.fields)}
        action={submitWebForm}
        hidden={{ company: company.slug, form: form.slug, stamp: formStamp(company.id, form.id) }}
        submitLabel="Send"
        honeypot
      />
      <p className="mt-6 text-xs text-charcoal-500">
        Your details are used by {settings.companyName} only to answer this request{settings.phone ? `. Questions? Call ${settings.phone}` : ""}.
      </p>
    </div>,
  );
}
