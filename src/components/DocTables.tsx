import Link from "next/link";
import type { Customer, Invoice, JobCard, Quotation } from "@prisma/client";
import { fmtDate, fmtDateTime, money } from "@/lib/format";
import { Empty, StatusBadge } from "./ui";

type WithCustomer<T> = T & { customer?: Pick<Customer, "id" | "name"> };

export function invoiceDisplayStatus(inv: Pick<Invoice, "status" | "dueDate">) {
  if ((inv.status === "SENT" || inv.status === "PARTIALLY_PAID") && inv.dueDate < new Date()) return "OVERDUE";
  return inv.status;
}

export function QuotationTable({ rows, symbol }: { rows: WithCustomer<Quotation>[]; symbol: string }) {
  if (!rows.length) return <Empty>No quotations yet.</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Number</th>
          {rows[0].customer && <th>Customer</th>}
          <th>Title</th>
          <th>Date</th>
          <th>Valid until</th>
          <th>Status</th>
          <th className="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((q) => (
          <tr key={q.id}>
            <td><Link className="font-semibold text-kudu-600 hover:underline" href={`/quotations/${q.id}`}>{q.number}</Link></td>
            {q.customer && <td><Link href={`/customers/${q.customer.id}`} className="hover:text-kudu-600">{q.customer.name}</Link></td>}
            <td>{q.title}</td>
            <td>{fmtDate(q.issueDate)}</td>
            <td>{fmtDate(q.validUntil)}</td>
            <td><StatusBadge status={q.status} /></td>
            <td className="text-right tabular-nums">{money(q.total, symbol)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function JobCardTable({ rows }: { rows: WithCustomer<JobCard>[] }) {
  if (!rows.length) return <Empty>No job cards yet.</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Number</th>
          {rows[0].customer && <th>Customer</th>}
          <th>Job type</th>
          <th>Scheduled</th>
          <th>Technician</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((j) => (
          <tr key={j.id}>
            <td><Link className="font-semibold text-kudu-600 hover:underline" href={`/job-cards/${j.id}`}>{j.number}</Link></td>
            {j.customer && <td><Link href={`/customers/${j.customer.id}`} className="hover:text-kudu-600">{j.customer.name}</Link></td>}
            <td>{j.jobType}</td>
            <td>{fmtDateTime(j.scheduledStart) || <span className="text-charcoal-400">Not scheduled</span>}</td>
            <td>{j.technician}</td>
            <td><StatusBadge status={j.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InvoiceTable({ rows, symbol }: { rows: WithCustomer<Invoice>[]; symbol: string }) {
  if (!rows.length) return <Empty>No invoices yet.</Empty>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Number</th>
          {rows[0].customer && <th>Customer</th>}
          <th>Date</th>
          <th>Due</th>
          <th>Status</th>
          <th className="text-right">Total</th>
          <th className="text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id}>
            <td><Link className="font-semibold text-kudu-600 hover:underline" href={`/invoices/${i.id}`}>{i.number}</Link></td>
            {i.customer && <td><Link href={`/customers/${i.customer.id}`} className="hover:text-kudu-600">{i.customer.name}</Link></td>}
            <td>{fmtDate(i.issueDate)}</td>
            <td>{fmtDate(i.dueDate)}</td>
            <td><StatusBadge status={invoiceDisplayStatus(i)} /></td>
            <td className="text-right tabular-nums">{money(i.total, symbol)}</td>
            <td className="text-right tabular-nums">{i.status === "CANCELLED" ? "–" : money(i.total - i.amountPaid, symbol)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
