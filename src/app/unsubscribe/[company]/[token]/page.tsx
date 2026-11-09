import { EmailConsent } from "@prisma/client";
import { confirmUnsubscribe } from "@/app/actions/unsubscribe";
import { PortalBrand } from "@/components/Portal";
import { getCompany } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { readUnsubscribeToken } from "@/lib/email/links";

export const metadata = { title: "Unsubscribe" };

/**
 * Where the "Unsubscribe" link in a campaign email lands. Opening the page changes nothing (link
 * scanners open links too); the button does. No sign-in needed.
 */
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ company: string; token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { company: companyId, token } = await params;
  const { done } = await searchParams;
  const company = await getCompany(companyId);
  const recipientId = company?.active ? readUnsubscribeToken(company.id, token) : null;
  const db = company && recipientId ? clientForCompany(company) : null;
  const [settings, recipient] = db
    ? await Promise.all([
        db.settings.findUnique({ where: { id: 1 }, select: { logo: true, companyName: true, phone: true, email: true } }),
        db.emailRecipient.findUnique({ where: { id: recipientId! }, include: { customer: { select: { emailConsent: true } } } }),
      ])
    : [null, null];
  const name = settings?.companyName || "us";
  const already = recipient?.unsubscribedAt || recipient?.customer?.emailConsent === EmailConsent.UNSUBSCRIBED;

  return (
    <div className="flex min-h-screen items-center justify-center bg-charcoal-800 p-4">
      <div className="w-full max-w-md rounded-xl border-t-4 border-kudu-600 bg-white p-8 text-center shadow-xl">
        {settings && <PortalBrand settings={settings} />}
        {!recipient ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">This unsubscribe link is not valid.</p>
            <p className="text-charcoal-600">
              {recipientId === "test" || token.startsWith("test.")
                ? "It came from a test email, so there is nothing to unsubscribe."
                : `If you want to stop receiving marketing email, reply to the email and ask ${name} to remove you.`}
            </p>
          </div>
        ) : done || already ? (
          <div className="space-y-2 text-sm">
            <h1 className="text-lg font-bold">You are unsubscribed</h1>
            <p className="text-charcoal-600">
              <strong>{recipient.email}</strong> will not receive marketing email from {name} again. You may still get emails about work you booked, such as quotations and invoices.
            </p>
            {settings?.email && <p className="text-charcoal-500">Changed your mind? Email {settings.email}.</p>}
          </div>
        ) : (
          <form action={confirmUnsubscribe} className="space-y-4 text-sm">
            <input type="hidden" name="company" value={companyId} />
            <input type="hidden" name="token" value={token} />
            <h1 className="text-lg font-bold">Stop marketing emails from {name}?</h1>
            <p className="text-charcoal-600">
              We will stop sending marketing email to <strong>{recipient.email}</strong>.
            </p>
            <button className="btn-primary w-full py-2.5">Yes, unsubscribe me</button>
          </form>
        )}
      </div>
    </div>
  );
}
