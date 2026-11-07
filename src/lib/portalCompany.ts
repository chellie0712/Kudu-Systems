import { cookies } from "next/headers";
import { COMPANY_COOKIE } from "@/auth";
import { getCompanyBySlug, normaliseSlug, platformDb } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";

/**
 * The company a signed-out portal page is for: from the link (?company=), the last sign-in, or
 * the only company there is. Returns its code and its name/logo for the page.
 */
export async function portalCompany(fromLink?: string) {
  let slug = normaliseSlug(fromLink ?? "") || (await cookies()).get(COMPANY_COOKIE)?.value || "";
  if (!slug) {
    const active = await platformDb.company.findMany({ where: { active: true }, select: { slug: true }, take: 2 });
    if (active.length === 1) slug = active[0].slug;
  }
  const company = slug ? await getCompanyBySlug(slug) : null;
  const settings = company?.active
    ? await clientForCompany(company).settings.findUnique({ where: { id: 1 }, select: { logo: true, companyName: true, phone: true, email: true } })
    : null;
  return { slug, company: company?.active ? company : null, settings };
}
