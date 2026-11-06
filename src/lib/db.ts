import { cache } from "react";
import { redirect } from "next/navigation";
import type { PrismaClient } from "@prisma/client";
import { getSessionCompanyId } from "@/auth";
import { getCompany } from "./platform";
import { clientForCompany } from "./tenant";

export type TenantDb = PrismaClient;

/**
 * The signed-in user's company and its database client. Every query for customers,
 * quotations, job cards, invoices, calendar, settings and users goes through this,
 * so a session can only ever reach its own company's database.
 */
export const currentCompany = cache(async () => {
  const companyId = await getSessionCompanyId();
  if (!companyId) redirect("/login");
  const company = await getCompany(companyId);
  if (!company || !company.active) redirect("/login?error=CompanyDisabled");
  return { company, db: clientForCompany(company) };
});

export async function tenantDb(): Promise<TenantDb> {
  return (await currentCompany()).db;
}
