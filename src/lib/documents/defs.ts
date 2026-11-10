// Document templates (Documents → Templates): certificates, agreements and letters written by the
// company, filled in from a customer, quotation, job card or invoice. No server code here, so the
// template editor's live preview uses it too. Loading the data is in ./data.ts.

export type DocSubject = "customer" | "quote" | "job" | "invoice";

export const DOC_SUBJECTS: Record<DocSubject, string> = {
  job: "Job card",
  quote: "Quotation",
  invoice: "Invoice",
  customer: "Customer",
};

type FieldGroup = { label: string; subjects: DocSubject[] | "all"; fields: Record<string, [label: string, example: string]> };

/** Merge fields, written {{key}} in a template. The example fills the editor's preview. */
export const FIELD_GROUPS: FieldGroup[] = [
  {
    label: "Document",
    subjects: "all",
    fields: {
      "doc.number": ["Document number", "CERT-0001"],
      "doc.date": ["Today's date", "10 Nov 2026"],
    },
  },
  {
    label: "Your company",
    subjects: "all",
    fields: {
      "company.name": ["Company name", "Kudu Systems"],
      "company.address": ["Address", "12 Main Road, Johannesburg"],
      "company.phone": ["Phone", "011 555 0100"],
      "company.email": ["Email", "info@kudu.co.za"],
      "company.website": ["Website", "www.kudu.co.za"],
      "company.vatNumber": ["VAT number", "4123456789"],
      "company.regNumber": ["Registration number", "2020/123456/07"],
      "company.pcoNumber": ["PCO registration number", "P00000"],
    },
  },
  {
    label: "Customer",
    subjects: "all",
    fields: {
      "customer.name": ["Name", "Acme Foods (Pty) Ltd"],
      "customer.contact": ["Contact person", "Thandi Mokoena"],
      "customer.email": ["Email", "thandi@acme.co.za"],
      "customer.phone": ["Phone", "082 555 1234"],
      "customer.billingAddress": ["Billing address", "PO Box 1, Sandton"],
      "customer.siteAddress": ["Site address", "5 Factory Street, Midrand"],
      "customer.vatNumber": ["VAT number", "4987654321"],
      "customer.regNumber": ["Registration number", "2015/654321/07"],
    },
  },
  {
    label: "Job card",
    subjects: ["job"],
    fields: {
      "job.number": ["Job card number", "JC-0001"],
      "job.date": ["Job date", "10 Nov 2026"],
      "job.type": ["Job type", "General pest control"],
      "job.technician": ["Technician", "Tumi Tech"],
      "job.siteAddress": ["Site address", "5 Factory Street, Midrand"],
      "job.siteContact": ["Site contact", "Thandi Mokoena"],
      "job.scope": ["Scope of work", "Cockroach treatment of kitchen and storeroom"],
      "job.areaTreated": ["Area treated", "Kitchen, storeroom"],
      "job.workDone": ["Work done", "Gel bait applied to all cracks and crevices."],
      "job.products": ["Products / active ingredients", "Fipronil 0.05% gel"],
      "job.warrantyNo": ["Warranty number", "JC-0001"],
      "job.warrantyStart": ["Warranty start", "10 Nov 2026"],
      "job.warrantyEnd": ["Warranty end", "10 Feb 2027"],
      "job.warrantyCovers": ["Warranty covers", "General Pest Control"],
      "job.warrantyTerms": ["Warranty terms (from Settings)", "Covers re-treatment of the pest species and areas listed above…"],
      "job.signedBy": ["Signed off by", "Thandi Mokoena"],
      "job.signedDate": ["Sign-off date", "10 Nov 2026"],
      "job.quote": ["Quotation number", "QT-0001"],
    },
  },
  {
    label: "Quotation",
    subjects: ["quote"],
    fields: {
      "quote.number": ["Quotation number", "QT-0001"],
      "quote.date": ["Date", "10 Nov 2026"],
      "quote.validUntil": ["Valid until", "10 Dec 2026"],
      "quote.title": ["Title", "Monthly pest control service"],
      "quote.siteAddress": ["Site address", "5 Factory Street, Midrand"],
      "quote.subtotal": ["Subtotal (excl. VAT)", "R 1 000.00"],
      "quote.vat": ["VAT", "R 150.00"],
      "quote.total": ["Total (incl. VAT)", "R 1 150.00"],
      "quote.notes": ["Notes", ""],
      "quote.terms": ["Terms", "This quotation is valid for the period stated."],
    },
  },
  {
    label: "Invoice",
    subjects: ["invoice"],
    fields: {
      "invoice.number": ["Invoice number", "INV-0001"],
      "invoice.date": ["Date", "10 Nov 2026"],
      "invoice.dueDate": ["Due date", "10 Dec 2026"],
      "invoice.reference": ["Reference", "PO 4411"],
      "invoice.total": ["Total (incl. VAT)", "R 1 150.00"],
      "invoice.paid": ["Paid", "R 0.00"],
      "invoice.balance": ["Still owing", "R 1 150.00"],
      "invoice.daysOverdue": ["Days overdue", "12"],
      "company.bank": ["Your banking details", "FNB · Kudu Systems · 62000000000 · 250655"],
    },
  },
];

export const groupsFor = (s: DocSubject) => FIELD_GROUPS.filter((g) => g.subjects === "all" || g.subjects.includes(s));
export const exampleData = (s: DocSubject): Record<string, string> =>
  Object.fromEntries(groupsFor(s).flatMap((g) => Object.entries(g.fields).map(([k, [, ex]]) => [k, ex])));

/** Blocks written on a line of their own. */
export const BLOCKS: Record<string, string> = {
  "[[items]]": "The line items (quotation or invoice; a job card uses its quotation's)",
  "[[signatures]]": "Signature lines: the client (signed on screen) and your company",
  "[[pagebreak]]": "Start a new printed page",
};

export type DocItem = { description: string; quantity: number; unit: string; unitPrice: number };

/** Replaces {{field}} with the values; unknown fields become empty. */
export function mergeFields(text: string, data: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => data[k] ?? "");
}

/** Fields in the text that do not exist for this kind of document, for the editor's warning. */
export function unknownFields(text: string, s: DocSubject): string[] {
  const known = exampleData(s);
  return [...new Set([...text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !(k in known)))];
}

// ---------- Layout ----------

export type Block =
  | { t: "h1" | "h2" | "p" | "note"; text: string }
  | { t: "list"; items: string[] }
  | { t: "items" | "signatures" | "pagebreak" | "rule" };

/** Splits template text into blocks. Paragraphs are separated by a blank line. */
export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join("\n") });
    if (list.length) blocks.push({ t: "list", items: list });
    para = [];
    list = [];
  };
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const bare = line.trim();
    if (!bare) {
      flush();
      continue;
    }
    if (bare === "[[items]]" || bare === "[[signatures]]" || bare === "[[pagebreak]]") {
      flush();
      blocks.push({ t: bare.slice(2, -2) as "items" | "signatures" | "pagebreak" });
    } else if (bare === "---") {
      flush();
      blocks.push({ t: "rule" });
    } else if (bare.startsWith("## ")) {
      flush();
      blocks.push({ t: "h2", text: bare.slice(3) });
    } else if (bare.startsWith("# ")) {
      flush();
      blocks.push({ t: "h1", text: bare.slice(2) });
    } else if (bare.startsWith("> ")) {
      flush();
      blocks.push({ t: "note", text: bare.slice(2) });
    } else if (/^[-•] /.test(bare)) {
      if (para.length) flush();
      list.push(bare.slice(2));
    } else {
      if (list.length) flush();
      para.push(line);
    }
  }
  flush();
  return blocks;
}

/** Splits **bold** parts out of a line. */
export function boldParts(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((p) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? { text: p.slice(2, -2), bold: true } : { text: p, bold: false }));
}

// ---------- Ready-made templates ----------

export type StarterTemplate = { key: string; name: string; appliesTo: DocSubject; title: string; prefix: string; showInPortal: boolean; body: string };

export const STARTERS: StarterTemplate[] = [
  {
    key: "treatment-certificate",
    name: "Certificate of treatment",
    appliesTo: "job",
    title: "Certificate of Treatment",
    prefix: "CERT-",
    showInPortal: true,
    body: `This certifies that the premises below were treated by **{{company.name}}** (PCO registration {{company.pcoNumber}}).

## Client
**{{customer.name}}**
{{job.siteAddress}}

## Treatment
**Date:** {{job.date}}
**Job card:** {{job.number}}
**Treatment:** {{job.type}}
**Areas treated:** {{job.areaTreated}}
**Products / active ingredients:** {{job.products}}
**Technician:** {{job.technician}}

## Work done
{{job.workDone}}

> Keep this certificate for your food-safety, health and safety or insurance audits.

[[signatures]]`,
  },
  {
    key: "warranty-certificate",
    name: "Warranty certificate",
    appliesTo: "job",
    title: "Service Warranty",
    prefix: "WAR-",
    showInPortal: true,
    body: `**Warranty number:** {{job.warrantyNo}}
**Client:** {{customer.name}}
**Premises:** {{job.siteAddress}}
**Treatment date:** {{job.date}} (job card {{job.number}})

## Period of cover
From **{{job.warrantyStart}}** to **{{job.warrantyEnd}}**.

## What is covered
{{job.warrantyCovers}}

## Conditions
{{job.warrantyTerms}}

[[signatures]]`,
  },
  {
    key: "service-agreement",
    name: "Service agreement",
    appliesTo: "quote",
    title: "Pest Control Service Agreement",
    prefix: "SA-",
    showInPortal: true,
    body: `**Agreement number:** {{doc.number}}
**Date:** {{doc.date}}

This agreement is between **{{company.name}}** ("the service provider") and **{{customer.name}}** ("the client"), for the premises at {{quote.siteAddress}}.

## 1. Services
The service provider will carry out the following, as set out in quotation {{quote.number}}:

[[items]]

## 2. Fees
The client will pay **{{quote.total}}** (including VAT) as invoiced. Invoices are payable within the period stated on each invoice.

## 3. Term
This agreement starts on the date it is signed and runs for 12 months. It continues month to month afterwards until either party gives one month's written notice.

## 4. Client responsibilities
- Give reasonable access to the premises at the agreed times.
- Follow the preparation and safety instructions given before each treatment.
- Report any pest activity between visits as soon as possible.

## 5. General
{{quote.terms}}

[[signatures]]`,
  },
  {
    key: "letter",
    name: "Letter to a customer",
    appliesTo: "customer",
    title: "",
    prefix: "LET-",
    showInPortal: false,
    body: `{{doc.date}}

**{{customer.name}}**
{{customer.billingAddress}}

Dear {{customer.contact}}

## Subject of the letter

Write the letter here.

Kind regards

{{company.name}}
{{company.phone}} · {{company.email}}`,
  },
  {
    key: "payment-reminder",
    name: "Payment reminder letter",
    appliesTo: "invoice",
    title: "Payment Reminder",
    prefix: "LET-",
    showInPortal: true,
    body: `{{doc.date}}

**{{customer.name}}**
{{customer.billingAddress}}

Dear {{customer.contact}}

## Invoice {{invoice.number}}: {{invoice.balance}} outstanding

Our records show that invoice {{invoice.number}} dated {{invoice.date}} was due on **{{invoice.dueDate}}** and **{{invoice.balance}}** is still outstanding ({{invoice.daysOverdue}} days overdue).

Please pay the balance into the account below, using **{{invoice.number}}** as the reference. If you have already paid, please send us the proof of payment and ignore this letter.

{{company.bank}}

Kind regards

{{company.name}}
{{company.phone}} · {{company.email}}`,
  },
];
