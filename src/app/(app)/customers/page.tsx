import Link from "next/link";
import { requireUser } from "@/auth";
import { db } from "@/lib/db";
import { Empty, Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; msg?: string }>;
}) {
  await requireUser();
  const { q = "", archived, msg } = await searchParams;
  const showArchived = archived === "1";
  const customers = await db.customer.findMany({
    where: {
      archived: showArchived,
      ...(q
        ? {
            OR: ["name", "contactPerson", "email", "phone", "siteAddress"].map((f) => ({
              [f]: { contains: q, mode: "insensitive" as const },
            })),
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { quotations: true, jobCards: true, invoices: true } },
      invoices: { where: { status: { in: ["SENT", "PARTIALLY_PAID"] } }, select: { total: true, amountPaid: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} ${showArchived ? "archived" : "active"} customer${customers.length === 1 ? "" : "s"}`}
        actions={<Link href="/customers/new" className="btn-primary">+ New customer</Link>}
      />
      <Flash message={msg} />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Search name, contact, email, phone, address…" className="input max-w-md" />
        {showArchived && <input type="hidden" name="archived" value="1" />}
        <button className="btn-dark">Search</button>
        <Link href={showArchived ? "/customers" : "/customers?archived=1"} className="btn-outline">
          {showArchived ? "Show active" : "Show archived"}
        </Link>
      </form>
      <div className="card overflow-x-auto">
        {customers.length === 0 ? (
          <Empty>No customers found.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Phone</th>
                <th>Email</th>
                <th className="text-center">Quotes</th>
                <th className="text-center">Job cards</th>
                <th className="text-center">Invoices</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/customers/${c.id}`} className="font-semibold text-charcoal-800 hover:text-kudu-600">
                      {c.name}
                    </Link>
                    <div className="text-xs text-charcoal-500">{c.type === "BUSINESS" ? "Business" : "Individual"}</div>
                  </td>
                  <td>{c.contactPerson}</td>
                  <td>{c.phone}</td>
                  <td>{c.email}</td>
                  <td className="text-center">{c._count.quotations}</td>
                  <td className="text-center">{c._count.jobCards}</td>
                  <td className="text-center">{c._count.invoices}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
