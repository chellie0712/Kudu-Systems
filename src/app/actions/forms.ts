"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { canAccessJobCard } from "@/lib/permissions";
import { str } from "@/lib/form";
import { getCompanyBySlug } from "@/lib/platform";
import { clientForCompany } from "@/lib/tenant";
import { newFieldId, parseFields, readAnswers, slugify, summaryOf, TEMPLATES } from "@/lib/forms";
import { ipHash, processWebSubmission, stampOk } from "@/lib/webforms";
import type { FormResult } from "@/components/FormRenderer";
import { emit } from "@/lib/workflows/events";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

/** A slug not used by another form. */
async function freeSlug(db: Prisma.TransactionClient | Awaited<ReturnType<typeof tenantDb>>, want: string, id?: string) {
  const base = slugify(want);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const other = await db.form.findUnique({ where: { slug }, select: { id: true } });
    if (!other || other.id === id) return slug;
  }
}

/** Start a new form from a template. */
export async function createForm(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("forms.manage");
  const t = TEMPLATES.find((x) => x.key === str(fd, "template")) ?? TEMPLATES[TEMPLATES.length - 1];
  const name = str(fd, "name").slice(0, 120) || t.name;
  const form = await db.form.create({
    data: {
      name,
      slug: await freeSlug(db, name),
      description: t.description,
      public: t.public,
      internal: !t.public,
      linkTo: t.linkTo,
      fields: t.fields.map((f) => ({ ...f, id: newFieldId() })),
      createdBy: user.name,
    },
  });
  redirect(`/forms/${form.id}/edit?msg=${encodeURIComponent("Form created. Change the fields, then save.")}`);
}

export async function saveForm(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("forms.manage");
  const id = str(fd, "id");
  const path = `/forms/${id}/edit`;
  let raw: unknown;
  try {
    raw = JSON.parse(str(fd, "fields") || "[]");
  } catch {
    raw = [];
  }
  const fields = parseFields(raw);
  const name = str(fd, "name").slice(0, 120);
  if (!name) go(path, "err", "Give the form a name.");
  if (!fields.some((f) => f.type !== "heading")) go(path, "err", "Add at least one question (questions need a label).");
  const linkTo = ["customer", "jobCard"].includes(str(fd, "linkTo")) ? str(fd, "linkTo") : "";
  await db.form.update({
    where: { id },
    data: {
      name,
      slug: await freeSlug(db, str(fd, "slug") || name, id),
      description: str(fd, "description").slice(0, 2000),
      fields,
      active: fd.get("active") === "on",
      internal: fd.get("internal") === "on",
      public: fd.get("public") === "on",
      linkTo,
      thankYou: str(fd, "thankYou").slice(0, 1000) || "Thank you. We have received your details and will be in touch soon.",
      createCustomer: fd.get("createCustomer") === "on",
      createQuery: fd.get("createQuery") === "on",
      createTask: fd.get("createTask") === "on",
      taskCategory: str(fd, "taskCategory").slice(0, 80) || "Follow-up call",
    },
  });
  revalidatePath("/forms");
  go(path, "msg", "Form saved");
}

export async function deleteForm(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("forms.delete");
  const f = await db.form.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/forms");
  go("/forms", "msg", `Form “${f.name}” and its submissions deleted`);
}

/** Staff fill in an internal form, optionally for a customer or job card. */
export async function submitForm(fd: FormData): Promise<FormResult> {
  const db = await tenantDb();
  const user = await requirePermission("forms.fill");
  const form = await db.form.findFirst({ where: { id: str(fd, "formId"), active: true, internal: true } });
  if (!form) return { error: "This form is not available any more." };
  const fields = parseFields(form.fields);
  const { answers, errors } = readAnswers(fields, fd);
  if (Object.keys(errors).length) return { errors };
  const customerId = str(fd, "customerId");
  const jobCardId = str(fd, "jobCardId");
  const jobCard = jobCardId ? await db.jobCard.findUnique({ where: { id: jobCardId }, select: { id: true, customerId: true, technicianId: true } }) : null;
  if (jobCard && !canAccessJobCard(user, jobCard)) return { error: "You can't fill in forms for this job card." };
  const customer = customerId ? await db.customer.findUnique({ where: { id: customerId }, select: { id: true } }) : null;
  if (form.linkTo === "jobCard" && !jobCard) return { error: "Open this form from a job card." };
  if (form.linkTo === "customer" && !customer && !jobCard) return { error: "Choose the customer." };
  const s = await db.formSubmission.create({
    data: {
      formId: form.id,
      data: answers,
      summary: summaryOf(fields, answers),
      source: "staff",
      customerId: customer?.id ?? jobCard?.customerId ?? null,
      jobCardId: jobCard?.id ?? null,
      submittedById: user.id,
      submittedBy: user.name,
      reviewedAt: new Date(),
      reviewedBy: user.name,
    },
  });
  await emit(db, "form.submitted", s.id, { formId: form.id });
  revalidatePath("/forms");
  redirect(`/forms/submissions/${s.id}?msg=${encodeURIComponent(`${form.name} saved`)}`);
}

/** Public: someone sends in a web form. No sign-in; the company comes from the address. */
export async function submitWebForm(fd: FormData): Promise<FormResult> {
  const companySlug = str(fd, "company");
  const company = await getCompanyBySlug(companySlug);
  if (!company?.active) return { error: "This form is not available." };
  const db = clientForCompany(company);
  const form = await db.form.findFirst({ where: { slug: str(fd, "form"), active: true, public: true } });
  if (!form) return { error: "This form is not available any more." };
  const done = `/f/${encodeURIComponent(company.slug)}/${encodeURIComponent(form.slug)}?done=1`;
  // Spam: the hidden field must be empty and the form open for a few seconds; quietly "succeed".
  if (str(fd, "website") || !stampOk(company.id, form.id, str(fd, "stamp"))) redirect(done);
  const h = await headers();
  const ip = ipHash((h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "");
  if (ip && (await db.formSubmission.count({ where: { ipHash: ip, createdAt: { gte: new Date(Date.now() - 3600000) } } })) >= 10) {
    return { error: "Too many forms sent from your connection. Please try again later or phone us." };
  }
  const fields = parseFields(form.fields);
  const { answers, errors } = readAnswers(fields, fd);
  if (Object.keys(errors).length) return { errors };
  const links = await processWebSubmission(db, form, fields, answers);
  const sub = await db.formSubmission.create({
    data: { formId: form.id, data: answers, summary: summaryOf(fields, answers), source: "web", submittedBy: "Website", ipHash: ip, ...links },
  });
  await emit(db, "form.submitted", sub.id, { formId: form.id });
  redirect(done);
}

export async function markSubmissionReviewed(fd: FormData) {
  const db = await tenantDb();
  const user = await requirePermission("forms.view");
  const id = str(fd, "id");
  const undo = str(fd, "undo") === "1";
  await db.formSubmission.update({ where: { id }, data: undo ? { reviewedAt: null, reviewedBy: "" } : { reviewedAt: new Date(), reviewedBy: user.name } });
  revalidatePath("/forms");
  go(`/forms/submissions/${id}`, "msg", undo ? "Marked as new" : "Marked as dealt with");
}

export async function deleteSubmission(fd: FormData) {
  const db = await tenantDb();
  await requirePermission("forms.delete");
  const s = await db.formSubmission.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/forms");
  go(`/forms/${s.formId}/submissions`, "msg", "Submission deleted");
}
