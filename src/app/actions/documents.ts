"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/auth";
import { tenantDb } from "@/lib/db";
import { str } from "@/lib/form";
import { getSettings } from "@/lib/settings";
import { DOC_SUBJECTS, STARTERS, type DocSubject } from "@/lib/documents/defs";
import { generateDocument } from "@/lib/documents/data";
import { mayDocumentFor, maySeeDoc } from "@/lib/documents/access";

const go = (path: string, kind: "msg" | "err", text: string): never =>
  redirect(`${path}${path.includes("?") ? "&" : "?"}${kind}=${encodeURIComponent(text)}`);

const isSubject = (s: string): s is DocSubject => s in DOC_SUBJECTS;

export async function createTemplate(fd: FormData) {
  const user = await requirePermission("documents.templates");
  const db = await tenantDb();
  const starter = STARTERS.find((s) => s.key === str(fd, "starter"));
  const t = await db.docTemplate.create({
    data: starter
      ? { name: starter.name, appliesTo: starter.appliesTo, title: starter.title, body: starter.body, prefix: starter.prefix, showInPortal: starter.showInPortal, createdBy: user.name }
      : { name: "New template", appliesTo: "job", title: "", body: "Write the document here. Use the fields on the right to fill in details.\n\n[[signatures]]", prefix: "DOC-", createdBy: user.name },
  });
  revalidatePath("/documents");
  go(`/documents/templates/${t.id}`, "msg", "Template added. Change anything you like, then save.");
}

export async function saveTemplate(fd: FormData) {
  await requirePermission("documents.templates");
  const db = await tenantDb();
  const id = str(fd, "id");
  const path = `/documents/templates/${id}`;
  const appliesTo = str(fd, "appliesTo");
  const name = str(fd, "name").slice(0, 120);
  const body = String(fd.get("body") ?? "").slice(0, 50000);
  if (!name) go(path, "err", "Give the template a name.");
  if (!isSubject(appliesTo)) go(path, "err", "Choose what the document is made from.");
  if (!body.trim()) go(path, "err", "The document has no text.");
  const prefix = str(fd, "prefix").toUpperCase().replace(/[^A-Z0-9-/]/g, "").slice(0, 12) || "DOC-";
  await db.docTemplate.update({
    where: { id },
    data: {
      name,
      appliesTo,
      title: str(fd, "title").slice(0, 200),
      body,
      prefix,
      showInPortal: fd.get("showInPortal") === "on",
      letterhead: fd.get("letterhead") === "on",
      active: fd.get("active") === "on",
    },
  });
  revalidatePath("/documents");
  go(path, "msg", "Template saved.");
}

export async function deleteTemplate(fd: FormData) {
  await requirePermission("documents.templates");
  const db = await tenantDb();
  const t = await db.docTemplate.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/documents");
  go("/documents/templates", "msg", `“${t.name}” deleted. Documents already made from it are kept.`);
}

/** Makes a document from a template for a customer, quotation, job card or invoice. */
export async function makeDocument(fd: FormData) {
  const user = await requirePermission("documents.create");
  const db = await tenantDb();
  await getSettings();
  const back = str(fd, "returnTo") || "/documents";
  const t = await db.docTemplate.findFirst({ where: { id: str(fd, "templateId"), active: true } });
  if (!t) return go(back, "err", "Choose a template.");
  const subjectId = str(fd, "subjectId");
  if (!(await mayDocumentFor(db, user, t.appliesTo as DocSubject, subjectId))) go(back, "err", "You can't make documents for this.");
  let id = "";
  try {
    id = (await generateDocument(db, t.id, subjectId, user)).id;
  } catch (e) {
    go(back, "err", e instanceof Error ? e.message : "The document could not be made.");
  }
  revalidatePath(back);
  go(`/documents/${id}`, "msg", `${t.name} made.`);
}

/** The client signs the document on this device. A signed document can't be signed again. */
export async function signDocument(fd: FormData) {
  const user = await requirePermission("documents.create");
  const db = await tenantDb();
  const id = str(fd, "id");
  const path = `/documents/${id}`;
  const doc = await db.generatedDoc.findUnique({ where: { id } });
  if (!doc || !(await maySeeDoc(db, user, doc))) redirect("/documents");
  if (doc.clientSignedAt) go(path, "err", "This document is already signed.");
  const name = str(fd, "signedName").slice(0, 120);
  const signature = str(fd, "signature");
  if (!name) go(path, "err", "Enter the name of the person signing.");
  if (!/^data:image\/(png|jpeg);base64,/.test(signature) || signature.length > 600_000) go(path, "err", "Please sign in the box first.");
  await db.generatedDoc.updateMany({ where: { id, clientSignedAt: null }, data: { clientSignature: signature, clientSignedName: name, clientSignedAt: new Date() } });
  revalidatePath(path);
  go(path, "msg", `Signed by ${name}.`);
}

export async function deleteDocument(fd: FormData) {
  await requirePermission("documents.delete");
  const db = await tenantDb();
  const doc = await db.generatedDoc.delete({ where: { id: str(fd, "id") } });
  revalidatePath("/documents");
  go(`/customers/${doc.customerId}?tab=documents`, "msg", `${doc.number} deleted.`);
}
