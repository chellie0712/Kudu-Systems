import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** Comma-separated list of Google accounts allowed to sign in. Empty = nobody. */
const allowedEmails = (process.env.ALLOWED_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google({
      allowDangerousEmailAccountLinking: true,
      authorization: {
        params: {
          scope: `openid email profile ${CALENDAR_SCOPE}`,
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      const email = user.email?.toLowerCase();
      if (!email || !allowedEmails.includes(email)) return false;
      // Google only returns a refresh token on consent; keep the newest tokens on every sign-in.
      if (account?.provider === "google") {
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
      }
      return true;
    },
  },
});

export type AppUser = { id: string; name: string; email: string; image?: string | null };

/** Local demo mode: only honoured outside production. */
export const authDisabled = process.env.AUTH_DISABLED === "true" && process.env.NODE_ENV !== "production";

/** Use at the top of every page and server action. */
export async function requireUser(): Promise<AppUser> {
  if (authDisabled) return { id: "local-demo", name: "Demo User", email: "demo@localhost" };
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  return {
    id: session.user.id ?? "",
    name: session.user.name ?? session.user.email,
    email: session.user.email,
    image: session.user.image,
  };
}
