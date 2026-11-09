// Quotation and invoice layouts. A company picks one layout for quotes and one for
// invoices, and customises it (colour, font, logo, columns, wording) under
// Settings → Quote & invoice layout. Kept free of server-only imports so the
// layout designer can render live previews in the browser.

export const LAYOUTS = [
  {
    id: "classic",
    name: "Classic",
    description: "The original Kudu layout: logo and company details on the left, document number on the right, dark table header.",
  },
  {
    id: "statement",
    name: "Statement",
    description: "Document details top left, logo top right, FROM and TO columns, grey item lines, banking details and totals side by side, large balance due.",
  },
  {
    id: "modern",
    name: "Modern",
    description: "A full-width colour band across the top, tinted customer cards, striped item rows and a coloured total box.",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Lots of white space, thin lines and no filled blocks. Light on ink when printed.",
  },
  {
    id: "boxed",
    name: "Boxed",
    description: "A traditional form: centred letterhead and every section in its own bordered box.",
  },
] as const;

export type LayoutId = (typeof LAYOUTS)[number]["id"];

export function layoutId(value: string | null | undefined): LayoutId {
  return LAYOUTS.some((l) => l.id === value) ? (value as LayoutId) : "classic";
}

export const FONTS = {
  inter: { label: "Inter (modern sans-serif)", css: "var(--font-inter), ui-sans-serif, system-ui, sans-serif" },
  arial: { label: "Arial / Helvetica", css: "Arial, Helvetica, sans-serif" },
  serif: { label: "Georgia (serif)", css: "Georgia, 'Times New Roman', serif" },
} as const;
export type FontId = keyof typeof FONTS;

export const LOGO_SIZES = { s: "Small", m: "Medium", l: "Large" } as const;
export type LogoSize = keyof typeof LOGO_SIZES;

export const ACCENT_PRESETS = [
  { value: "#9b1530", label: "Kudu crimson" },
  { value: "#1f2530", label: "Charcoal" },
  { value: "#1d4ed8", label: "Blue" },
  { value: "#047857", label: "Green" },
  { value: "#b45309", label: "Amber" },
  { value: "#6d28d9", label: "Purple" },
];

export type DocStyle = {
  /** Accent colour used for headings, lines and highlights. */
  accent: string;
  font: FontId;
  logoSize: LogoSize;
  /** "auto" keeps the layout's own logo position. */
  logoSide: "auto" | "left" | "right";
  /** First line of each item description in bold, the lines under it in italics. */
  itemHeadings: boolean;
  /** Per-line VAT % and incl. VAT total columns. */
  lineVat: boolean;
  /** Show the unit (e.g. "m²", "hrs") next to the quantity. */
  showUnits: boolean;
  /** Print banking details on quotations too (always on invoices when filled in). */
  quoteBanking: boolean;
  /** "Accepted by" signature lines at the bottom of quotations. */
  quoteSignature: boolean;
  quoteTitle: string;
  /** Empty = automatic: "Tax Invoice" when the company has a VAT number, otherwise "Invoice". */
  invoiceTitle: string;
  /** Company contact person printed in the company details. */
  contactPerson: string;
  /** Printed at the bottom of every quotation and invoice. */
  footer: string;
};

export const DEFAULT_STYLE: DocStyle = {
  accent: "#9b1530",
  font: "inter",
  logoSize: "m",
  logoSide: "auto",
  itemHeadings: false,
  lineVat: false,
  showUnits: true,
  quoteBanking: false,
  quoteSignature: true,
  quoteTitle: "Quotation",
  invoiceTitle: "",
  contactPerson: "",
  footer: "",
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Read a stored (or submitted) style, falling back to the defaults for anything missing or invalid. */
export function parseDocStyle(raw: unknown): DocStyle {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const s = { ...DEFAULT_STYLE };
  if (typeof o.accent === "string" && HEX.test(o.accent)) s.accent = o.accent.toLowerCase();
  if (typeof o.font === "string" && o.font in FONTS) s.font = o.font as FontId;
  if (typeof o.logoSize === "string" && o.logoSize in LOGO_SIZES) s.logoSize = o.logoSize as LogoSize;
  if (o.logoSide === "left" || o.logoSide === "right" || o.logoSide === "auto") s.logoSide = o.logoSide;
  for (const k of ["itemHeadings", "lineVat", "showUnits", "quoteBanking", "quoteSignature"] as const) {
    if (typeof o[k] === "boolean") s[k] = o[k] as boolean;
  }
  for (const k of ["quoteTitle", "invoiceTitle", "contactPerson", "footer"] as const) {
    if (typeof o[k] === "string") s[k] = (o[k] as string).slice(0, k === "footer" ? 1000 : 80);
  }
  if (!s.quoteTitle.trim()) s.quoteTitle = DEFAULT_STYLE.quoteTitle;
  return s;
}

/** Everything a layout needs, already formatted, so it can be rendered on the server or in the browser. */
export type DocData = {
  kind: "quote" | "invoice";
  number: string;
  /** Date, valid until / due date, reference. */
  meta: [string, string][];
  /** Quotation title, e.g. "General crawling insect treatment". */
  heading: string;
  company: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    vatNumber: string;
    regNumber: string;
    branchName: string;
  };
  customer: {
    name: string;
    contactPerson: string;
    email: string;
    phone: string;
    vatNumber: string;
    billingAddress: string;
    siteAddress: string;
  };
  items: { id: string; description: string; quantity: number; unit: string; unitPrice: number }[];
  totals: { subtotal: number; discount: number; vatRate: number; vatAmount: number; total: number; paid: number };
  notes: string;
  terms: string;
  bank: { name: string; accountName: string; accountNumber: string; branchCode: string } | null;
  symbol: string;
};

export function docTitle(doc: Pick<DocData, "kind" | "company">, style: DocStyle) {
  if (doc.kind === "quote") return style.quoteTitle || "Quotation";
  return style.invoiceTitle.trim() || (doc.company.vatNumber ? "Tax Invoice" : "Invoice");
}

/** A sample quotation used for the layout previews in Settings. */
export function sampleDoc(company: DocData["company"], bank: DocData["bank"], symbol: string, vatRate: number): DocData {
  const items = [
    {
      id: "1",
      description:
        "General crawling insect treatment\nResidual spray to the interior and the exterior perimeter up to 1 metre from the walls.\nGel bait in kitchen cupboards and around appliances.",
      quantity: 1,
      unit: "",
      unitPrice: 190000,
    },
    { id: "2", description: "Rodent bait stations\nTamper-proof stations placed along the boundary wall.", quantity: 4, unit: "ea", unitPrice: 18500 },
    { id: "3", description: "Follow-up visit\nHotspot treatment after 21 days.", quantity: 1, unit: "", unitPrice: 45000 },
  ];
  const subtotal = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  const discount = 0;
  const vatAmount = Math.round(((subtotal - discount) * vatRate) / 100);
  return {
    kind: "quote",
    number: "QT-0042",
    meta: [
      ["Date", "06 Nov 2026"],
      ["Valid until", "06 Dec 2026"],
    ],
    heading: "Pest control for 61 Devonshire Avenue",
    company,
    customer: {
      name: "Jordan Naidoo",
      contactPerson: "Jordan Naidoo",
      email: "jordan@example.com",
      phone: "084 000 0000",
      vatNumber: "",
      billingAddress: "61 Devonshire Avenue\nBryanston\nSandton\n2191",
      siteAddress: "61 Devonshire Avenue\nBryanston\nSandton",
    },
    items,
    totals: { subtotal, discount, vatRate, vatAmount, total: subtotal - discount + vatAmount, paid: 0 },
    notes: "Please remove boxes and containers from the areas to be treated.",
    terms: "This quotation is valid for the period stated. A 50% deposit secures the booking.",
    bank,
    symbol,
  };
}
