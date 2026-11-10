// Forms built in Kudu (Forms → Build): internal checklists and records filled in by staff, and
// web forms published for the company's website. Fields are stored as JSON on the Form.
import { z } from "zod";

export const FIELD_TYPES = {
  heading: "Heading / text",
  text: "Short answer",
  textarea: "Long answer",
  email: "Email",
  phone: "Phone",
  number: "Number",
  date: "Date",
  select: "Dropdown",
  radio: "Choose one",
  checkboxes: "Tick all that apply",
  yesno: "Yes / No",
  signature: "Signature",
} as const;
export type FieldType = keyof typeof FIELD_TYPES;
export const CHOICE_TYPES: FieldType[] = ["select", "radio", "checkboxes"];

/** Where a web form answer goes when it creates or finds a customer. */
export const MAP_TO = {
  "": "Nothing",
  name: "Customer / company name",
  contactPerson: "Contact person",
  email: "Email",
  phone: "Phone",
  address: "Address",
  message: "Message (goes in the query and task)",
} as const;
export type MapTo = keyof typeof MAP_TO;

const fieldSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]{1,40}$/i),
  type: z.enum(Object.keys(FIELD_TYPES) as [FieldType, ...FieldType[]]),
  label: z.string().trim().max(300).default(""),
  help: z.string().trim().max(500).default(""),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  mapTo: z.enum(Object.keys(MAP_TO) as [MapTo, ...MapTo[]]).default(""),
});
export type FormField = z.infer<typeof fieldSchema>;

/** The fields of a form, ignoring anything malformed. */
export function parseFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  const out: FormField[] = [];
  const seen = new Set<string>();
  for (const f of raw) {
    const r = fieldSchema.safeParse(f);
    if (r.success && !seen.has(r.data.id) && (r.data.label || r.data.type === "heading")) {
      seen.add(r.data.id);
      out.push({ ...r.data, options: CHOICE_TYPES.includes(r.data.type) ? r.data.options : [], required: r.data.type === "heading" ? false : r.data.required });
    }
  }
  return out;
}

export type Answers = Record<string, string | string[]>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** Reads and checks the answers to `fields` from a submitted form. Field inputs are named `f_<id>`. */
export function readAnswers(fields: FormField[], fd: FormData): { answers: Answers; errors: Record<string, string> } {
  const answers: Answers = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "heading") continue;
    const name = `f_${f.id}`;
    if (f.type === "checkboxes") {
      const picked = fd.getAll(name).map(String).filter((v) => f.options.includes(v));
      if (picked.length) answers[f.id] = picked;
      else if (f.required) errors[f.id] = "Tick at least one.";
      continue;
    }
    const v = String(fd.get(name) ?? "").trim().slice(0, f.type === "signature" ? 400_000 : f.type === "textarea" ? 5000 : 500);
    if (!v) {
      if (f.required) errors[f.id] = f.type === "signature" ? "Please sign." : "This is required.";
      continue;
    }
    if (f.type === "email" && !EMAIL.test(v)) errors[f.id] = "Enter a valid email address.";
    else if (f.type === "phone" && v.replace(/\D/g, "").length < 9) errors[f.id] = "Enter a valid phone number.";
    else if (f.type === "number" && !Number.isFinite(Number(v.replace(",", ".")))) errors[f.id] = "Enter a number.";
    else if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errors[f.id] = "Enter a date.";
    else if ((f.type === "select" || f.type === "radio") && !f.options.includes(v)) errors[f.id] = "Choose one of the options.";
    else if (f.type === "yesno" && v !== "Yes" && v !== "No") errors[f.id] = "Choose Yes or No.";
    else if (f.type === "signature" && !SIGNATURE.test(v)) errors[f.id] = "The signature could not be read.";
    else answers[f.id] = v;
  }
  return { answers, errors };
}

/** An answer as text, for lists, CSV and notes. */
export function answerText(f: FormField, a: string | string[] | undefined): string {
  if (a === undefined) return "";
  if (Array.isArray(a)) return a.join(", ");
  if (f.type === "signature") return "(signed)";
  return a;
}

/** A short line for submission lists: the first two answers. */
export function summaryOf(fields: FormField[], answers: Answers): string {
  return fields
    .filter((f) => f.type !== "heading" && f.type !== "signature" && answers[f.id] !== undefined)
    .slice(0, 2)
    .map((f) => answerText(f, answers[f.id]))
    .join(" · ")
    .slice(0, 200);
}

/** The answers mapped to customer details (web forms). */
export function mapped(fields: FormField[], answers: Answers): Partial<Record<Exclude<MapTo, "">, string>> {
  const out: Partial<Record<Exclude<MapTo, "">, string>> = {};
  for (const f of fields) {
    if (!f.mapTo || answers[f.id] === undefined) continue;
    const v = answerText(f, answers[f.id]);
    out[f.mapTo] = out[f.mapTo] ? `${out[f.mapTo]}\n${v}` : v;
  }
  return out;
}

/** All answers as "Label: answer" lines, e.g. for a query or task description. */
export function answersAsText(fields: FormField[], answers: Answers): string {
  return fields
    .filter((f) => f.type !== "heading" && answers[f.id] !== undefined)
    .map((f) => `${f.label}: ${answerText(f, answers[f.id])}`)
    .join("\n");
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "form";
}

/** A new random field id. */
export const newFieldId = () => Math.random().toString(36).slice(2, 10);

/** Starter forms offered when making a new form. */
export const TEMPLATES: { key: string; name: string; description: string; public: boolean; linkTo: string; fields: Omit<FormField, "id">[] }[] = [
  {
    key: "quote-request",
    name: "Request a quote",
    description: "Tell us about the pest problem and we'll get back to you with a quote.",
    public: true,
    linkTo: "",
    fields: [
      { type: "text", label: "Your name", help: "", required: true, options: [], mapTo: "contactPerson" },
      { type: "text", label: "Company (if a business)", help: "", required: false, options: [], mapTo: "name" },
      { type: "phone", label: "Phone", help: "", required: true, options: [], mapTo: "phone" },
      { type: "email", label: "Email", help: "", required: true, options: [], mapTo: "email" },
      { type: "textarea", label: "Address of the property", help: "", required: false, options: [], mapTo: "address" },
      { type: "checkboxes", label: "Which pests?", help: "", required: false, options: ["Cockroaches", "Rodents", "Ants", "Termites", "Bed bugs", "Fleas", "Other"], mapTo: "" },
      { type: "radio", label: "Type of property", help: "", required: false, options: ["Home", "Business", "Restaurant / food", "Other"], mapTo: "" },
      { type: "textarea", label: "Anything else we should know?", help: "", required: false, options: [], mapTo: "message" },
    ],
  },
  {
    key: "contact",
    name: "Contact us",
    description: "Send us a message and we'll reply as soon as we can.",
    public: true,
    linkTo: "",
    fields: [
      { type: "text", label: "Name", help: "", required: true, options: [], mapTo: "contactPerson" },
      { type: "email", label: "Email", help: "", required: true, options: [], mapTo: "email" },
      { type: "phone", label: "Phone", help: "", required: false, options: [], mapTo: "phone" },
      { type: "textarea", label: "Message", help: "", required: true, options: [], mapTo: "message" },
    ],
  },
  {
    key: "site-inspection",
    name: "Site inspection",
    description: "Filled in on site before a treatment.",
    public: false,
    linkTo: "jobCard",
    fields: [
      { type: "heading", label: "Site", help: "", required: false, options: [], mapTo: "" },
      { type: "radio", label: "Activity level", help: "", required: true, options: ["None", "Low", "Medium", "High"], mapTo: "" },
      { type: "checkboxes", label: "Areas inspected", help: "", required: false, options: ["Kitchen", "Storeroom", "Roof / ceiling", "Garden", "Drains", "Other"], mapTo: "" },
      { type: "yesno", label: "Food handling area?", help: "", required: true, options: [], mapTo: "" },
      { type: "yesno", label: "Children or pets on site?", help: "", required: true, options: [], mapTo: "" },
      { type: "textarea", label: "Findings and recommendations", help: "", required: false, options: [], mapTo: "" },
      { type: "signature", label: "Client signature", help: "", required: false, options: [], mapTo: "" },
    ],
  },
  { key: "blank", name: "Blank form", description: "", public: false, linkTo: "", fields: [] },
];
