import Link from "next/link";
import { requireUser } from "@/auth";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "No access" };

export default async function NoAccessPage() {
  const user = await requireUser();
  return (
    <div className="max-w-xl">
      <PageHeader title="You don't have access to that" />
      <div className="card space-y-3 p-6 text-sm">
        <p>
          Your role is <b>{user.roleName}</b>, which does not include that page or action.
        </p>
        <p className="text-charcoal-500">If you need it, ask an admin of your company to change your role in Settings → Users &amp; roles.</p>
        <Link href="/" className="btn-primary inline-block">Back to the dashboard</Link>
      </div>
    </div>
  );
}
