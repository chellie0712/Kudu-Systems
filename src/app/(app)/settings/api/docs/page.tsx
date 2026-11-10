import { requirePermission } from "@/auth";
import { siteUrl } from "@/lib/email/links";
import { PageHeader, SectionTitle } from "@/components/ui";

export const metadata = { title: "API guide" };

const ENDPOINTS: [string, string, string, string][] = [
  ["GET", "/api/v1", "read", "Checks the key: the company and what the key may do."],
  ["GET", "/api/v1/customers", "read", "Customers. ?search= (name, email, phone), ?email=, ?includeArchived=true"],
  ["GET", "/api/v1/customers/{id}", "read", "One customer with its contacts."],
  ["POST", "/api/v1/customers", "write", "Adds a customer. The contact fields become the primary contact. Workflows for “A new customer is added” run."],
  ["PATCH", "/api/v1/customers/{id}", "write", "Changes only the fields sent. archived: true archives it."],
  ["GET", "/api/v1/quotations", "read", "Quotations with their lines. ?status=DRAFT|SENT|ACCEPTED|DECLINED|EXPIRED"],
  ["GET", "/api/v1/quotations/{id}", "read", "One quotation."],
  ["GET", "/api/v1/job-cards", "read", "Job cards. ?status=SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED"],
  ["GET", "/api/v1/job-cards/{id}", "read", "One job card, with sign-off and warranty."],
  ["GET", "/api/v1/invoices", "read", "Invoices with lines and payments. ?status=DRAFT|SENT|PARTIALLY_PAID|PAID|CANCELLED"],
  ["GET", "/api/v1/invoices/{id}", "read", "One invoice."],
  ["GET", "/api/v1/queries", "read", "Customer queries. ?status=OPEN|IN_PROGRESS|WAITING_ON_CUSTOMER|RESOLVED|CLOSED"],
  ["GET", "/api/v1/queries/{id}", "read", "One query."],
  ["POST", "/api/v1/queries", "write", "Logs a query (a lead, complaint or request). Give customerId, or customer details: the customer is found by email, or added."],
];

const Code = ({ children }: { children: string }) => <pre className="overflow-x-auto rounded-md bg-charcoal-900 p-3 text-xs leading-relaxed text-charcoal-50">{children}</pre>;

export default async function ApiDocsPage() {
  await requirePermission("integrations.manage");
  const base = `${await siteUrl()}/api/v1`;
  return (
    <div className="max-w-4xl">
      <PageHeader back={{ href: "/settings/api", label: "API & webhooks" }} title="API guide" subtitle="For whoever connects another system to Kudu. Everything is JSON over HTTPS." />

      <div className="card space-y-4 p-6 text-sm">
        <SectionTitle>Signing in</SectionTitle>
        <p>Make a key under Settings → API &amp; webhooks and send it in the Authorization header of every request:</p>
        <Code>{`curl ${base}/customers?search=acme \\\n  -H "Authorization: Bearer kudu_yourcompany_…"`}</Code>
        <p>
          A read-only key gets <b>403</b> on POST and PATCH. A wrong or revoked key gets <b>401</b>. More than 120 requests a minute with one key get <b>429</b>; wait a minute and try again.
        </p>

        <SectionTitle>What you can do</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-charcoal-500">
              <tr><th className="py-1 pr-2">Method</th><th className="py-1 pr-2">Path</th><th className="py-1 pr-2">Key</th><th className="py-1">What it does</th></tr>
            </thead>
            <tbody className="divide-y divide-charcoal-100">
              {ENDPOINTS.map(([m, p, k, d]) => (
                <tr key={m + p}>
                  <td className="py-1.5 pr-2 font-mono font-semibold">{m}</td>
                  <td className="py-1.5 pr-2 font-mono">{p}</td>
                  <td className="py-1.5 pr-2">{k}</td>
                  <td className="py-1.5">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <SectionTitle>Lists</SectionTitle>
        <p>
          Lists are newest first and answer <code>{"{ \"data\": [...], \"nextCursor\": \"…\" }"}</code>. Ask for the next page with <code>?cursor=</code> and the nextCursor; it is null on the last page.
          <code> ?limit=</code> sets the page size (1 to 100, 50 if not given). <code>?updatedSince=2026-11-01T00:00:00Z</code> gives only what changed since then, and <code>?customerId=</code> filters by customer.
        </p>

        <SectionTitle>Amounts and dates</SectionTitle>
        <p>Amounts are in rands, with cents as decimals: <code>1150.5</code> is R1 150,50. Totals include VAT; <code>subtotal</code> and <code>vat</code> are given too. Dates are ISO 8601 in UTC.</p>

        <SectionTitle>Adding a customer</SectionTitle>
        <Code>{`curl -X POST ${base}/customers \\\n  -H "Authorization: Bearer kudu_…" -H "Content-Type: application/json" \\\n  -d '{"type":"business","name":"Acme Foods","contactPerson":"Thandi Nkosi","email":"thandi@acme.co.za","phone":"082 555 0101","siteAddress":"12 Main Rd, Durban"}'`}</Code>
        <p>Fields: type (business or individual), name, contactPerson, email, phone, altPhone, vatNumber, regNumber, billingAddress, siteAddress, notes, leadSource (&quot;API&quot; if not given). Unknown fields are refused with a 400 that says which.</p>

        <SectionTitle>Logging a query or website lead</SectionTitle>
        <Code>{`curl -X POST ${base}/queries \\\n  -H "Authorization: Bearer kudu_…" -H "Content-Type: application/json" \\\n  -d '{"subject":"Rats in the storeroom","description":"Please quote for monthly service","category":"Quote request","customer":{"name":"Joe's Diner","email":"joe@diner.co.za","phone":"083 555 0199"}}'`}</Code>
        <p>Answers 201 with the query, and <code>customerCreated</code>: true when a new customer was added. Fields: subject (required), description, category, source (&quot;API&quot; if not given), priority (LOW, NORMAL, HIGH, URGENT), and customerId or customer.</p>

        <SectionTitle>Errors</SectionTitle>
        <Code>{`{ "error": { "code": "invalid", "message": "email: Not an email address" } }`}</Code>
        <p>Codes: unauthorized (401), forbidden (403), not_found (404), bad_request and invalid (400), rate_limited (429), server_error (500).</p>
      </div>

      <div className="card mt-6 space-y-4 p-6 text-sm">
        <SectionTitle>Webhook messages</SectionTitle>
        <p>Kudu sends a POST with a JSON body like this. <code>event</code> is the thing that happened (the keys shown on the webhook page), <code>ping</code> for a test, or <code>workflow</code> when a workflow step sent it. <code>data</code> holds the record in the same shape as the API.</p>
        <Code>{`{
  "id": "evt_6f1c…",            // the same id if a message is sent again: use it to ignore repeats
  "event": "job.status",
  "createdAt": "2026-11-10T09:30:00.000Z",
  "company": "Kudu Pest Control",
  "link": "https://…/job-cards/clx…",
  "data": { "jobCard": { "id": "clx…", "number": "JC-0042", "status": "COMPLETED", "customer": { … }, … } }
}`}</Code>
        <p>
          Headers: <code>Kudu-Event</code>, <code>Kudu-Delivery</code> (this message&apos;s id) and <code>Kudu-Signature</code>. Answer with any 2xx status within 10 seconds. Anything else, or no
          answer, is tried again after 1 minute, 10 minutes, 1 hour, 6 hours and 1 day. Retries happen when Kudu is in use and in the daily job, so with nobody signed in a retry can come later. After 50 failed
          tries in a row the webhook is switched off. Kudu does not follow redirects.
        </p>

        <h3 id="signatures" className="font-semibold">Checking the signature</h3>
        <p>
          <code>Kudu-Signature: t=1731231000,v1=5f2b…</code>. Work out HMAC-SHA256 of <code>{"<t>.<the raw body>"}</code> with the webhook&apos;s signing secret, as hex, and compare it with v1. Refuse messages whose t
          is more than 5 minutes old, so an old message can&apos;t be replayed.
        </p>
        <Code>{`// Node.js (Express): app.post("/kudu", express.raw({ type: "application/json" }), handler)
import { createHmac, timingSafeEqual } from "node:crypto";

function fromKudu(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const want = createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  return want.length === v1.length && timingSafeEqual(Buffer.from(want), Buffer.from(v1));
}`}</Code>
        <Code>{`# Python
import hmac, hashlib, time
def from_kudu(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    want = hmac.new(secret.encode(), f"{parts['t']}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(want, parts["v1"])`}</Code>
      </div>
    </div>
  );
}
