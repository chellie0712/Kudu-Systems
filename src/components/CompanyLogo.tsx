import Image from "next/image";
import { currentCompany } from "@/lib/db";
import { MAIN_COMPANY_ID } from "@/lib/platform";

/**
 * The signed-in company's logo (uploaded in Settings). Until one is uploaded, the original
 * company shows the Kudu logo and other companies show their name.
 */
export async function CompanyLogo({ logo, name, className = "h-16 w-auto" }: { logo: string | null; name: string; className?: string }) {
  if (logo) {
    // Data URL from the company's own database; next/image cannot optimise it.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={logo} alt={name} className={`${className} object-contain`} />;
  }
  const { company } = await currentCompany();
  if (company.id === MAIN_COMPANY_ID) {
    return <Image src="/kudu-logo-sm.png" alt={name} width={600} height={389} className={className} />;
  }
  return <span className="text-2xl font-extrabold tracking-tight text-charcoal-800">{name}</span>;
}
