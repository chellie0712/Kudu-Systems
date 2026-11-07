import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MAIN_COMPANY_ID, getCompany, getCompanyBySlug, platformDb, type Company } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { can, type Permission, type Role } from "@/lib/permissions";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const googleSignInEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Remembers the company code typed on the sign-in page (and tells Google sign-in which company it is for). */
export const COMPANY_COOKIE = "kudu_company";

/** Comma-separated list of Google accounts allowed to sign in with Google. */
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

type SignedIn = { id: string; email: string | null; name: string | null; companyId?: string; kind: "company" | "platform" };

async function activeCompany(slug: string): Promise<Company | null> {
  const company = await getCompanyBySlug(slug);
  return company?.active ? company : null;
}

/**
 * Email + password sign-in to one company. For the main company only, the very first login,
 * while it has no password users, may use ADMIN_EMAIL / ADMIN_PASSWORD; that creates its first admin.
 * Other companies get their first admin from the super-admin who creates them.
 */
async function authorizeCompanyUser(company: Company, email: string, password: string): Promise<SignedIn | null> {
  const db = clientForCompany(company);
  const user = await db.user.findUnique({ where: { email } });
  const signedIn = (u: { id: string; email: string | null; name: string | null }): SignedIn => ({
    id: u.id, email: u.email, name: u.name, companyId: company.id, kind: "company",
  });
  if (user?.passwordHash) {
    if (user.disabled || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return signedIn(user);
  }
  if (company.id !== MAIN_COMPANY_ID) return null;
  const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_PASSWORD;
  if (!bootstrapEmail || !bootstrapPassword || email !== bootstrapEmail || password !== bootstrapPassword) return null;
  if ((await db.user.count({ where: { passwordHash: { not: null } } })) > 0) return null;
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await db.user.upsert({
    where: { email },
    update: { passwordHash, disabled: false, role: "ADMIN" },
    create: { email, name: "Administrator", passwordHash, role: "ADMIN" },
  });
  return signedIn(created);
}

/**
 * Super-admin sign-in. While no super-admin exists, SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD
 * (or, if those are not set, ADMIN_EMAIL / ADMIN_PASSWORD) create the first one.
 */
async function authorizePlatformAdmin(email: string, password: string): Promise<SignedIn | null> {
  const admin = await platformDb.platformAdmin.findUnique({ where: { email } });
  if (admin) {
    if (admin.disabled || !(await bcrypt.compare(password, admin.passwordHash))) return null;
    return { id: admin.id, email: admin.email, name: admin.name, kind: "platform" };
  }
  const bootstrapEmail = (process.env.SUPER_ADMIN_EMAIL || process.env.ADMIN_EMAIL)?.trim().toLowerCase();
  const bootstrapPassword = process.env.SUPER_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD;
  if (!bootstrapEmail || !bootstrapPassword || email !== bootstrapEmail || password !== bootstrapPassword) return null;
  if ((await platformDb.platformAdmin.count()) > 0) return null;
  const created = await platformDb.platformAdmin.create({
    data: { email, name: "Super-admin", passwordHash: await bcrypt.hash(password, 12) },
  });
  return { id: created.id, email: created.email, name: created.name, kind: "platform" };
}

const field = (v: unknown) => String(v ?? "").trim();

/** Company for a Google sign-in: the code remembered from the sign-in page. */
async function companyFromCookie(): Promise<Company | null> {
  const slug = (await cookies()).get(COMPANY_COOKIE)?.value;
  return slug ? activeCompany(slug) : null;
}

function buildConfig(googleTenant: { company: Company; db: PrismaClient } | null): NextAuthConfig {
  const providers: NextAuthConfig["providers"] = [
    Credentials({
      id: "credentials",
      credentials: { company: { label: "Company code" }, email: { label: "Email" }, password: { label: "Password", type: "password" } },
      authorize: async (creds) => {
        const email = field(creds?.email).toLowerCase();
        const password = String(creds?.password ?? "");
        const company = await activeCompany(field(creds?.company));
        if (!company || !email || !password) return null;
        return authorizeCompanyUser(company, email, password);
      },
    }),
    Credentials({
      id: "platform",
      credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
      authorize: async (creds) => {
        const email = field(creds?.email).toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        return authorizePlatformAdmin(email, password);
      },
    }),
  ];
  if (googleSignInEnabled) {
    providers.push(
      Google({
        allowDangerousEmailAccountLinking: true,
        authorization: { params: { scope: `openid email profile ${CALENDAR_SCOPE}`, access_type: "offline", prompt: "consent" } },
      }),
    );
  }

  return {
    // Google sign-in stores its tokens in the company's own database; the adapter is only
    // needed on the Google callback, where the company is known from the cookie.
    ...(googleTenant ? { adapter: PrismaAdapter(googleTenant.db) } : {}),
    // Password sign-in requires JWT sessions in Auth.js.
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    providers,
    callbacks: {
      async signIn({ user, account }) {
        if (account?.provider !== "google") return true;
        if (!googleTenant) return false;
        const { db } = googleTenant;
        const email = user.email?.toLowerCase();
        // Google: either listed in ALLOWED_EMAILS or an existing, enabled user of this company.
        const existing = email ? await db.user.findUnique({ where: { email } }) : null;
        if (!email || existing?.disabled || (!allowedEmails.includes(email) && !existing)) return false;
        // Google only returns a refresh token on consent; keep the newest tokens on every sign-in.
        await db.account
          .update({
            where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
            data: {
              access_token: account.access_token,
              expires_at: account.expires_at,
              scope: account.scope,
              id_token: account.id_token,
              ...(account.refresh_token ? { refresh_token: account.refresh_token } : {}),
            },
          })
          .catch(() => undefined); // first sign-in: the adapter creates the row itself
        return true;
      },
      jwt({ token, user, account }) {
        if (user) {
          const u = user as Partial<SignedIn>;
          if (account?.provider === "google") {
            token.kind = "company";
            token.companyId = googleTenant?.company.id;
          } else {
            token.kind = u.kind ?? "company";
            token.companyId = u.companyId;
          }
        }
        return token;
      },
      session({ session, token }) {
        if (token.sub) session.user.id = token.sub;
        const s = session as typeof session & { kind?: string; companyId?: string };
        s.kind = typeof token.kind === "string" ? token.kind : undefined;
        s.companyId = typeof token.companyId === "string" ? token.companyId : undefined;
        return session;
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(async (req) => {
  // Only the Google callback (a route request) needs the company's database adapter.
  let googleTenant: { company: Company; db: PrismaClient } | null = null;
  if (req && googleSignInEnabled && req.nextUrl?.pathname.includes("/google")) {
    const company = await companyFromCookie();
    if (company) googleTenant = { company, db: clientForCompany(company) };
  }
  return buildConfig(googleTenant);
});

export type AppUser = { id: string; name: string; email: string; image?: string | null; role: Role };

/** Local demo mode: only honoured outside production. Uses the main company. */
export const authDisabled = process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

type AppSession = { user?: { id?: string }; kind?: string; companyId?: string } | null;

/** The company the current session belongs to, or null (not signed in, or a super-admin session). */
export async function getSessionCompanyId(): Promise<string | null> {
  if (authDisabled) return MAIN_COMPANY_ID;
  const session = (await auth()) as AppSession;
  if (!session?.user?.id || session.kind === "platform") return null;
  // Sessions from before companies existed belong to the main company.
  return session.companyId ?? MAIN_COMPANY_ID;
}

/** The signed-in, enabled user of an active company, or null. Looked up once per request. */
export const getUser = cache(async (): Promise<AppUser | null> => {
  if (authDisabled) {
    const demoRole = process.env.DEMO_ROLE;
    return { id: "local-demo", name: "Demo User", email: "demo@localhost", role: demoRole === "OFFICE" || demoRole === "TECHNICIAN" ? demoRole : "ADMIN" };
  }
  const session = (await auth()) as AppSession;
  const companyId = await getSessionCompanyId();
  if (!session?.user?.id || !companyId) return null;
  const company = await getCompany(companyId);
  if (!company?.active) return null;
  // JWT sessions outlive changes in the database, so re-check the account on each request.
  const user = await clientForCompany(company).user.findUnique({ where: { id: session.user.id } });
  if (!user || user.disabled) return null;
  return { id: user.id, name: user.name ?? user.email ?? "", email: user.email ?? "", image: user.image, role: user.role };
});

/** Use at the top of every page and server action. */
export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Use at the top of a page or server action that needs a permission (see src/lib/permissions.ts).
 * Someone signed in without it is sent to /no-access.
 */
export async function requirePermission(permission: Permission): Promise<AppUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(`/no-access?need=${permission}`);
  return user;
}

export type PlatformAdminUser = { id: string; name: string; email: string };

/** The signed-in super-admin, or null. */
export async function getPlatformAdmin(): Promise<PlatformAdminUser | null> {
  const session = (await auth()) as AppSession;
  if (!session?.user?.id || session.kind !== "platform") return null;
  const admin = await platformDb.platformAdmin.findUnique({ where: { id: session.user.id } });
  if (!admin || admin.disabled) return null;
  return { id: admin.id, name: admin.name || admin.email, email: admin.email };
}

/** Use at the top of every super-admin page and action. */
export async function requirePlatformAdmin(): Promise<PlatformAdminUser> {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/platform/login");
  return admin;
}
