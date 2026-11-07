// The common shape every accounting package plugs into. Kudu's sync engine (sync.ts) only talks to
// these interfaces; each package is an adapter in this folder. Money is in cents throughout.

export type ProviderId = "sage" | "xero" | "quickbooks" | "zoho" | "freshbooks" | "odoo" | "pastel";

export class AccountingError extends Error {}

export type Option = { id: string; name: string };

/** A choice the company makes once (tax type, sales account, bank...). No options = free text. */
export type Picker = { key: string; label: string; help?: string; required?: boolean; options?: Option[]; placeholder?: string; suggested?: string };

/** One field of a username/password or API-key form. Secret fields are stored encrypted. */
export type LoginField = { name: string; label: string; type?: "text" | "email" | "password" | "url"; secret?: boolean; help?: string; placeholder?: string };

/** The decrypted link for one company and one package. */
export type Link = {
  provider: ProviderId;
  credentials: Record<string, string>;
  orgId: string;
  orgName: string;
  config: Record<string, string>;
};

/** What an adapter gets on every call. saveCredentials keeps refreshed tokens. */
export type Ctx = { link: Link; saveCredentials: (c: Record<string, string>) => Promise<void> };

export type CustomerData = {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  altPhone: string;
  vatNumber: string;
  billingAddress: string;
  siteAddress: string;
};

export type InvoiceData = {
  id: string;
  number: string;
  issueDate: Date;
  dueDate: Date;
  reference: string;
  notes: string;
  vatRate: number; // 15 or 0
  subtotal: number; // cents, before discount, excl VAT
  discount: number; // cents, before VAT
  discountPct: number; // discount as % of subtotal (4 decimals)
  vatAmount: number;
  total: number;
  items: { description: string; quantity: number; unit: string; unitPrice: number }[];
};

export type PaymentData = { id: string; amount: number; date: Date; method: string; reference: string; invoiceNumber: string; customerName: string };

/** The package's own figures for an invoice, in cents. */
export type RemoteInvoice = { total: number; due: number };

export type EnvVar = { name: string; required: boolean; help: string };

type Common = {
  id: ProviderId;
  name: string;
  /** One line under the name in Settings. */
  blurb: string;
  /** Platform-level env vars (Vercel), shown when missing. */
  envVars: EnvVar[];
  configured: () => boolean;
};

export type ApiAdapter = Common & {
  kind: "api";
  /** "oauth" = Connect button that sends the admin to the package; "login" = a form of loginFields. */
  auth: "oauth" | "login";
  /** True when an organisation/company must be chosen (or comes from the OAuth callback). */
  needsOrg: boolean;
  loginFields?: LoginField[];
  authorizeUrl?: (state: string, redirectUri: string) => string;
  /** OAuth callback: swap the code for tokens. May fix the organisation (QuickBooks realmId). */
  exchangeCode?: (params: URLSearchParams, redirectUri: string) => Promise<{ credentials: Record<string, string>; orgId?: string; orgName?: string }>;
  /** Checks a login form (throws AccountingError when wrong). */
  verifyLogin?: (credentials: Record<string, string>) => Promise<void>;
  /** Organisations the login can reach; null when the package has only one per login. */
  organisations: (ctx: Ctx) => Promise<Option[] | null>;
  /** The choices for this organisation. */
  pickers: (ctx: Ctx, vatRate: number) => Promise<Picker[]>;
  upsertCustomer: (ctx: Ctx, c: CustomerData, existingId: string | null) => Promise<string>;
  upsertInvoice: (
    ctx: Ctx,
    inv: InvoiceData,
    customerId: string,
    existingId: string | null,
    opts: { useKuduNumber: boolean },
  ) => Promise<{ id: string; number: string; total?: number }>;
  createPayment: (ctx: Ctx, p: PaymentData, ext: { invoiceId: string; customerId: string }) => Promise<string>;
  deletePayment: (ctx: Ctx, paymentId: string) => Promise<void>;
  /** Null when the package can't tell (the invoice is skipped). */
  getInvoice: (ctx: Ctx, invoiceId: string) => Promise<RemoteInvoice | null>;
  /** Invoices to check per run, to stay under the package's rate limit. */
  pullPerRun: number;
  /** Shown on the invoice: "Sage has no draft invoices"... */
  notes?: string;
};

export type FileAdapter = Common & { kind: "file"; pickers: () => Picker[] };

export type Adapter = ApiAdapter | FileAdapter;
