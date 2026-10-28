import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export const googleSignInEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

/** Comma-separated list of Google accounts allowed to sign in with Google. */
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Email + password sign-in. The very first login, while no password users exist,
 * may use ADMIN_EMAIL / ADMIN_PASSWORD from the environment; that creates the first admin.
 */
async function authorizeWithPassword(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });
  if (user?.passwordHash) {
    if (user.disabled || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return { id: user.id, email: user.email, name: user.name };
  }
  const bootstrapEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const bootstrapPassword = process.env.ADMIN_PASSWORD;
  if (!bootstrapEmail || !bootstrapPassword || email !== bootstrapEmail || password !== bootstrapPassword) return null;
  if ((await db.user.count({ where: { passwordHash: { not: null } } })) > 0) return null;
  const passwordHash = await bcrypt.hash(password, 12);
  const created = await db.user.upsert({
    where: { email },
    update: { passwordHash, disabled: false },
    create: { email, name: "Administrator", passwordHash },
  });
  return { id: created.id, email: created.email, name: created.name };
}

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: { email: { label: "Email" }, password: { label: "Password", type: "password" } },
    authorize: async (creds) => {
      const email = String(creds?.email ?? "").trim().toLowerCase();
      const password = String(creds?.password ?? "");
      if (!email || !password) return null;
      return authorizeWithPassword(email, password);
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  // Password sign-in requires JWT sessions in Auth.js.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true;
      const email = user.email?.toLowerCase();
      // Google: either listed in ALLOWED_EMAILS or an existing, enabled Kudu user.
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
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export type AppUser = { id: string; name: string; email: string; image?: string | null };

/** Local demo mode: only honoured outside production. */
export const authDisabled = process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

/** The signed-in, enabled user, or null. */
export async function getUser(): Promise<AppUser | null> {
  if (authDisabled) return { id: "local-demo", name: "Demo User", email: "demo@localhost" };
  const session = await auth();
  if (!session?.user?.id) return null;
  // JWT sessions outlive changes in the database, so re-check the account on each request.
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user || user.disabled) return null;
  return { id: user.id, name: user.name ?? user.email ?? "", email: user.email ?? "", image: user.image };
}

/** Use at the top of every page and server action. */
export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
