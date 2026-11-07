"use server";

import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/auth";
import { str } from "@/lib/form";
import { DEFAULT_PRODUCTS } from "@/lib/jobcard";
import { parseLogo } from "@/lib/logo";
import { forgetCompany, normaliseSlug, platformDb } from "@/lib/platform";
import { createDatabase, databaseNameFor, directUrlForDatabase, migrateCompanyDatabase } from "@/lib/provision";
import { encryptSecret } from "@/lib/secret";
import { clientForCompany } from "@/lib/tenant";

const back = (path: string, kind: "msg" | "err", text: string, hash = "") =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}${hash}`);

function errorText(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // Never echo a connection string (it carries a password) back into the page.
  return m.replace(/postgres(ql)?:\/\/\S+/gi, "[connection string]").slice(0, 300);
}

/**
 * Creates a company with its own, empty database: creates the database, applies all
 * migrations, seeds its settings, products and first admin, then registers it.
 * Safe to retry with the same code after a failure: each step skips what already exists.
 */
export async function createCompany(fd: FormData) {
  await requirePlatformAdmin();
  const name = str(fd, "name");
  const slug = normaliseSlug(str(fd, "slug") || name);
  const adminName = str(fd, "adminName");
  const adminEmail = str(fd, "adminEmail").toLowerCase();
  const adminPassword = String(fd.get("adminPassword") ?? "");
  const mode = str(fd, "dbMode") === "url" ? "url" : "auto";
  const externalUrl = str(fd, "dbUrl");

  if (!name) back("/platform", "err", "Company name is required.");
  if (slug.length < 2) back("/platform", "err", "The company code needs at least 2 letters or digits.");
  if (!/^\S+@\S+\.\S+$/.test(adminEmail)) back("/platform", "err", "Enter a valid email for the company's first admin.");
  if (adminPassword.length < 10) back("/platform", "err", "The admin password needs at least 10 characters.");
  if (mode === "url" && !/^postgres(ql)?:\/\//.test(externalUrl)) back("/platform", "err", "The connection string must start with postgresql://");
  if (await platformDb.company.findUnique({ where: { slug } })) back("/platform", "err", `The company code "${slug}" is already in use.`);
  let logo: string | null = null;
  try {
    logo = parseLogo(str(fd, "logo"));
  } catch (e) {
    back("/platform", "err", errorText(e));
  }

  const databaseName = mode === "auto" ? databaseNameFor(slug) : null;
  let companyId = "";
  try {
    let directUrl = externalUrl;
    if (databaseName) {
      await createDatabase(databaseName);
      directUrl = directUrlForDatabase(databaseName);
    }
    await migrateCompanyDatabase(directUrl);

    const db = new PrismaClient({ datasourceUrl: directUrl });
    try {
      await db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1, companyName: name, tagline: "", logo } });
      if ((await db.product.count()) === 0) {
        await db.product.createMany({ data: DEFAULT_PRODUCTS.map((p, i) => ({ ...p, sortOrder: i })) });
      }
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await db.user.upsert({
        where: { email: adminEmail },
        update: { passwordHash, disabled: false, role: "ADMIN" },
        create: { email: adminEmail, name: adminName || "Administrator", passwordHash, role: "ADMIN" },
      });
    } finally {
      await db.$disconnect();
    }

    const company = await platformDb.company.create({
      data: { name, slug, databaseName, databaseUrl: mode === "url" ? encryptSecret(externalUrl) : null },
    });
    companyId = company.id;
  } catch (e) {
    back("/platform", "err", `Could not create the company: ${errorText(e)}`);
  }
  revalidatePath("/platform");
  back(`/platform/companies/${companyId}`, "msg", `${name} is ready. Its users sign in with company code "${slug}".`);
}

export async function updateCompany(fd: FormData) {
  await requirePlatformAdmin();
  const id = str(fd, "id");
  const path = `/platform/companies/${id}`;
  const name = str(fd, "name");
  const slug = normaliseSlug(str(fd, "slug"));
  if (!name || slug.length < 2) back(path, "err", "Name and a company code of at least 2 characters are required.");
  const clash = await platformDb.company.findUnique({ where: { slug } });
  if (clash && clash.id !== id) back(path, "err", `The company code "${slug}" is already in use.`);
  await platformDb.company.update({ where: { id }, data: { name, slug } });
  forgetCompany(id);
  back(path, "msg", "Company saved.");
}

export async function setCompanyActive(fd: FormData) {
  await requirePlatformAdmin();
  const id = str(fd, "id");
  const active = str(fd, "active") === "true";
  await platformDb.company.update({ where: { id }, data: { active } });
  forgetCompany(id);
  back(`/platform/companies/${id}`, "msg", active ? "Access switched on." : "Access switched off. Its users can no longer sign in; its data is kept.");
}

async function companyDb(id: string) {
  const company = await platformDb.company.findUnique({ where: { id } });
  if (!company) redirect("/platform?err=Company+not+found");
  return clientForCompany(company);
}

export async function addCompanyUser(fd: FormData) {
  await requirePlatformAdmin();
  const id = str(fd, "companyId");
  const path = `/platform/companies/${id}`;
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) back(path, "err", "Enter a valid email.", "#users");
  if (password.length < 10) back(path, "err", "Passwords need at least 10 characters.", "#users");
  const db = await companyDb(id);
  if (await db.user.findUnique({ where: { email } })) back(path, "err", `${email} is already a user of this company.`, "#users");
  // Users added by the super-admin are the company's admins; they add their own staff in Settings → Users.
  await db.user.create({ data: { email, name: str(fd, "name") || email, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" } });
  back(path, "msg", `${email} can now sign in.`, "#users");
}

export async function resetCompanyUserPassword(fd: FormData) {
  await requirePlatformAdmin();
  const id = str(fd, "companyId");
  const path = `/platform/companies/${id}`;
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) back(path, "err", "Passwords need at least 10 characters.", "#users");
  const db = await companyDb(id);
  await db.user.update({ where: { id: str(fd, "userId") }, data: { passwordHash: await bcrypt.hash(password, 12), disabled: false } });
  back(path, "msg", "Password set.", "#users");
}

export async function setCompanyUserDisabled(fd: FormData) {
  await requirePlatformAdmin();
  const id = str(fd, "companyId");
  const db = await companyDb(id);
  await db.user.update({ where: { id: str(fd, "userId") }, data: { disabled: str(fd, "disabled") === "true" } });
  back(`/platform/companies/${id}`, "msg", "User updated.", "#users");
}

export async function addPlatformAdmin(fd: FormData) {
  await requirePlatformAdmin();
  const email = str(fd, "email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) back("/platform", "err", "Enter a valid email.", "#admins");
  if (password.length < 10) back("/platform", "err", "Passwords need at least 10 characters.", "#admins");
  if (await platformDb.platformAdmin.findUnique({ where: { email } })) back("/platform", "err", `${email} is already a super-admin.`, "#admins");
  await platformDb.platformAdmin.create({ data: { email, name: str(fd, "name"), passwordHash: await bcrypt.hash(password, 12) } });
  back("/platform", "msg", `${email} is now a super-admin.`, "#admins");
}

export async function setPlatformAdminPassword(fd: FormData) {
  await requirePlatformAdmin();
  const password = String(fd.get("password") ?? "");
  if (password.length < 10) back("/platform", "err", "Passwords need at least 10 characters.", "#admins");
  await platformDb.platformAdmin.update({ where: { id: str(fd, "id") }, data: { passwordHash: await bcrypt.hash(password, 12) } });
  back("/platform", "msg", "Password set.", "#admins");
}

export async function setPlatformAdminDisabled(fd: FormData) {
  const me = await requirePlatformAdmin();
  const id = str(fd, "id");
  if (id === me.id) back("/platform", "err", "You cannot switch off your own super-admin account.", "#admins");
  await platformDb.platformAdmin.update({ where: { id }, data: { disabled: str(fd, "disabled") === "true" } });
  back("/platform", "msg", "Super-admin updated.", "#admins");
}
