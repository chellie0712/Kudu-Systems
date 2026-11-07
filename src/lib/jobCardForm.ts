import type { TenantDb } from "./db";
import { autoApplies, parseItems, type ChecklistInput } from "./checklists";
import type { TemplateOption } from "@/components/ChecklistEditor";

/** Custom statuses, checklist templates and the job card's checklists, for the job card form. */
export async function jobCardFormExtras(db: TenantDb, jc?: { id: string; statusId: string | null; jobType: string }) {
  const [statuses, templates, lists] = await Promise.all([
    db.jobStatus.findMany({
      where: jc?.statusId ? { OR: [{ active: true }, { id: jc.statusId }] } : { active: true },
      select: { id: true, name: true, stage: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.checklistTemplate.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    jc ? db.jobCardChecklist.findMany({ where: { jobCardId: jc.id }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
  ]);
  const templateOptions: TemplateOption[] = templates.map((t) => ({
    id: t.id,
    name: t.name,
    items: t.items,
    requiredForCompletion: t.requiredForCompletion,
    auto: autoApplies(t, jc?.jobType ?? ""),
  }));
  const checklists: ChecklistInput[] = lists.map((l) => ({
    id: l.id,
    templateId: l.templateId,
    name: l.name,
    requiredForCompletion: l.requiredForCompletion,
    items: parseItems(l.items),
  }));
  return { statuses, templates: templateOptions, checklists };
}
