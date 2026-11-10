import type { PrismaClient } from "@prisma/client";
import { CUSTOM_PREFIX, STAGES } from "@/lib/jobStatus";
import type { BuilderLists } from "./defs";

/** The company's people, mailboxes, branches, job statuses and forms, for the builder's drop-downs. */
export async function builderLists(db: PrismaClient): Promise<BuilderLists> {
  const [users, mailboxes, branches, statuses, forms, templates] = await Promise.all([
    db.user.findMany({ where: { disabled: false }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
    db.mailAccount.findMany({ where: { user: { disabled: false } }, select: { userId: true, email: true, user: { select: { name: true } } } }),
    db.branch.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.jobStatus.findMany({ select: { id: true, name: true, stage: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.form.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.docTemplate.findMany({ where: { active: true }, select: { id: true, name: true, appliesTo: true }, orderBy: { name: "asc" } }),
  ]);
  const stageName = (s: string) => STAGES.find((x) => x.value === s)?.label ?? s;
  return {
    users: Object.fromEntries(users.map((u) => [u.id, u.name || u.email || "?"])),
    mailboxes: Object.fromEntries(mailboxes.map((m) => [m.userId, `${m.user.name} (${m.email})`])),
    branches: Object.fromEntries(branches.map((b) => [b.id, b.name])),
    jobStatuses: {
      ...Object.fromEntries(STAGES.map((s) => [s.value, `${s.label} (any ${s.label.toLowerCase()} status)`])),
      ...Object.fromEntries(statuses.map((s) => [`${CUSTOM_PREFIX}${s.id}`, `${s.name} (${stageName(s.stage)})`])),
    },
    forms: Object.fromEntries(forms.map((f) => [f.id, f.name])),
    templates: Object.fromEntries(templates.map((t) => [t.id, { name: t.name, subject: t.appliesTo }])),
  };
}
