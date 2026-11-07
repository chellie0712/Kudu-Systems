import { z } from "zod";

export type ChecklistItem = { label: string; done: boolean; note: string };
export type ChecklistInput = {
  id?: string;
  templateId: string | null;
  name: string;
  requiredForCompletion: boolean;
  items: ChecklistItem[];
};

const itemSchema = z.object({ label: z.string().min(1), done: z.boolean().default(false), note: z.string().default("") });

export function parseItems(v: unknown): ChecklistItem[] {
  const r = z.array(itemSchema).safeParse(v);
  return r.success ? r.data : [];
}

const checklistSchema = z.array(
  z.object({
    id: z.string().optional(),
    templateId: z.string().nullable().default(null),
    name: z.string().min(1),
    requiredForCompletion: z.boolean().default(false),
    items: z.array(itemSchema),
  }),
);

export function parseChecklists(json: string): ChecklistInput[] {
  try {
    const r = checklistSchema.safeParse(JSON.parse(json || "[]"));
    return r.success ? r.data : [];
  } catch {
    return [];
  }
}

/** Template text (one item per line) to fresh, unticked items. */
export function itemsFromTemplate(text: string): ChecklistItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((label) => ({ label, done: false, note: "" }));
}

/** Names of required checklists that still have unticked items. */
export function incompleteRequired(lists: Pick<ChecklistInput, "name" | "requiredForCompletion" | "items">[]): string[] {
  return lists.filter((l) => l.requiredForCompletion && l.items.some((i) => !i.done)).map((l) => l.name);
}

/** Does a template apply to a job automatically? */
export function autoApplies(t: { autoAddAll: boolean; jobType: string; active: boolean }, jobType: string): boolean {
  if (!t.active) return false;
  return t.autoAddAll || (t.jobType.trim() !== "" && t.jobType.trim().toLowerCase() === jobType.trim().toLowerCase());
}
