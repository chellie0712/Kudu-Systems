"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { AuthError } from "next-auth";
import { COMPANY_COOKIE, requirePortalUser, signIn, signOut } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { getCompanyBySlug, normaliseSlug } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { nextNumber } from "@/lib/settings";
import { MIN_PASSWORD, PORTAL_QUERY_TYPES } from "@/lib/portal";

async function rememberCompany(slug: string) {
  (await cookies()).set(COMPANY_COOKIE, slug, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 24 * 60 * 60, path: "/" });
}

async function portalSignInAs(company: string, email: string, password: string, failTo: string) {
  try {
    await signIn("portal", { company, email, password, redirectTo: "/portal" });
  } catch (e) {
    if (e instanceof AuthError) redirect(failTo);
    throw e; // the success redirect
  }
}

export async function portalSignIn(fd: FormData) {
  const company = normaliseSlug(str(fd, "company"));
  await rememberCompany(company);
  await portalSignInAs(company, str(fd, "email").toLowerCase(), String(fd.get("password") ?? ""), `/portal/login?error=1&company=${encodeURIComponent(company)}`);
}

/** The customer opens the link the office sent them and chooses a password. */
export async function acceptPortalInvite(fd: FormData) {
  const slug = normaliseSlug(str(fd, "company"));
  const token = str(fd, "token");
  const password = String(fd.get("password") ?? "");
  const here = `/portal/invite/${slug}/${token}`;
  const fail = (text: string): never => redirect(`${here}?err=${encodeURIComponent(text)}`);
  if (password.length < MIN_PASSWORD) fail(`Choose a password of at least ${MIN_PASSWORD} characters.`);
  if (password !== String(fd.get("confirm") ?? "")) fail("The two passwords don't match.");
  const company = await getCompanyBySlug(slug);
  if (!company?.active) redirect("/portal/login");
  const db = clientForCompany(company);
  const pu = await db.portalUser.findUnique({ where: { inviteToken: token } });
  if (!pu || pu.disabled || !pu.inviteExpiresAt || pu.inviteExpiresAt < new Date()) redirect(here);
  await db.portalUser.update({
    where: { id: pu.id },
    data: { passwordHash: await bcrypt.hash(password, 12), inviteToken: null, inviteExpiresAt: null },
  });
  await rememberCompany(slug);
  await portalSignInAs(slug, pu.email, password, `/portal/login?company=${slug}`);
}

export async function portalSignOut() {
  await signOut({ redirectTo: "/portal/login" });
}

/** The customer accepts or declines a quotation they were sent. */
export async function respondToQuotation(answer: "ACCEPTED" | "DECLINED", fd: FormData) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const id = str(fd, "id");
  const path = `/portal/quotations/${id}`;
  const q = await db.quotation.findFirst({ where: { id, customerId: user.customerId, status: { notIn: ["DRAFT"] } } });
  if (!q) redirect("/portal");
  if (answer !== "ACCEPTED" && answer !== "DECLINED") redirect(path);
  if (q.status !== "SENT") redirect(`${path}?err=${encodeURIComponent("This quotation can no longer be answered online. Please contact us.")}`);
  if (q.validUntil < new Date(new Date().setHours(0, 0, 0, 0))) {
    redirect(`${path}?err=${encodeURIComponent("This quotation has expired. Please contact us for an updated quote.")}`);
  }
  await db.quotation.update({
    where: { id },
    data: {
      status: answer,
      response: answer,
      respondedAt: new Date(),
      respondedBy: `${user.name} (${user.email})`,
      responseNote: str(fd, "note").slice(0, 2000),
    },
  });
  revalidatePath("/quotations");
  revalidatePath("/");
  redirect(`${path}?msg=${encodeURIComponent(answer === "ACCEPTED" ? "Thank you, the quotation is accepted. We'll be in touch to book the work." : "Thank you for letting us know.")}`);
}

/** A question, complaint or re-service request from the customer; it lands in the office's Queries list. */
export async function logPortalQuery(fd: FormData) {
  const user = await requirePortalUser();
  const db = await tenantDb();
  const subject = str(fd, "subject");
  const type = str(fd, "category");
  if (!subject) redirect(`/portal/queries/new?err=${encodeURIComponent("Please enter a subject.")}`);
  const jobCardId = str(fd, "jobCardId");
  const jobCard = jobCardId ? await db.jobCard.findFirst({ where: { id: jobCardId, customerId: user.customerId }, select: { id: true } }) : null;
  const q = await db.query.create({
    data: {
      number: await nextNumber("query"),
      customerId: user.customerId,
      subject: subject.slice(0, 200),
      description: str(fd, "description").slice(0, 5000),
      category: (PORTAL_QUERY_TYPES as readonly string[]).includes(type) ? type : "General enquiry",
      source: "Customer portal",
      priority: type === "Complaint" ? "HIGH" : "NORMAL",
      jobCardId: jobCard?.id ?? null,
      createdBy: user.name,
      notes: { create: { text: `Logged by ${user.name} (${user.email}) in the customer portal`, system: true, userName: user.name } },
    },
  });
  revalidatePath("/queries");
  redirect(`/portal/queries?msg=${encodeURIComponent(`Thank you. Your reference is ${q.number}; we will get back to you.`)}`);
}
