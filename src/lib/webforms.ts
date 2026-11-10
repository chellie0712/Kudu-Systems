// Public web forms (/f/<company>/<form>): spam checks, and turning a submission into a customer,
// a query and a follow-up task. Runs without a session, so it works on a given company database.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Form, PrismaClient } from "@prisma/client";
import { ensurePrimary } from "./contacts";
import { nextNumberIn } from "./settings";
import { autoAssign } from "./tasks";
import { answersAsText, mapped, type Answers, type FormField } from "./forms";

const secret = () => process.env.AUTH_SECRET || "dev-secret";

/** A signed time stamp put in the form when it is shown, so bots that post straight away or replay old pages are caught. */
export function formStamp(companyId: string, formId: string, now = Date.now()): string {
  const sig = createHmac("sha256", `kudu-webform:${secret()}`).update(`${companyId}:${formId}:${now}`).digest("base64url").slice(0, 24);
  return `${now}.${sig}`;
}

/** Whether a stamp is genuine and the form was open between 3 seconds and 1 day. */
export function stampOk(companyId: string, formId: string, stamp: string, now = Date.now()): boolean {
  const [t, sig] = stamp.split(".");
  const at = Number(t);
  if (!Number.isFinite(at) || !sig) return false;
  const want = formStamp(companyId, formId, at).split(".")[1];
  if (want.length !== sig.length || !timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return false;
  return now - at >= 3000 && now - at <= 86400000;
}

/** The sender's address, hashed so it is not stored as is. */
export function ipHash(ip: string): string {
  return ip ? createHash("sha256").update(`${secret()}:${ip}`).digest("hex").slice(0, 32) : "";
}

const digits = (s: string) => s.replace(/\D/g, "");

/** Finds the customer by email, then phone, among customers and their contacts; adds a new lead if none. */
async function findOrCreateCustomer(db: PrismaClient, m: ReturnType<typeof mapped>, formName: string) {
  const email = m.email?.trim().toLowerCase();
  const phone = m.phone ? digits(m.phone) : "";
  if (email) {
    const c = await db.customer.findFirst({
      where: { archived: false, OR: [{ email: { equals: email, mode: "insensitive" } }, { contacts: { some: { email: { equals: email, mode: "insensitive" } } } }] },
      select: { id: true },
    });
    if (c) return { id: c.id, created: false };
  }
  if (phone.length >= 9) {
    const tail = phone.slice(-9); // ignore +27 / 0 prefixes
    const candidates = await db.customer.findMany({
      where: { archived: false, OR: [{ phone: { contains: tail.slice(-4) } }, { contacts: { some: { OR: [{ phone: { contains: tail.slice(-4) } }, { mobile: { contains: tail.slice(-4) } }] } } }] },
      select: { id: true, phone: true, contacts: { select: { phone: true, mobile: true } } },
      take: 50,
    });
    const hit = candidates.find((c) => [c.phone, ...c.contacts.flatMap((k) => [k.phone, k.mobile])].some((p) => p && digits(p).endsWith(tail)));
    if (hit) return { id: hit.id, created: false };
  }
  const person = m.contactPerson?.trim() || "";
  const name = m.name?.trim() || person || m.email || m.phone || "Web form lead";
  const c = await db.$transaction(async (tx) => {
    const created = await tx.customer.create({
      data: {
        name: name.slice(0, 200),
        type: m.name?.trim() ? "BUSINESS" : "INDIVIDUAL",
        siteAddress: (m.address ?? "").slice(0, 1000),
        leadSource: "Website",
        leadCampaign: formName.slice(0, 100),
        notes: `Added from the web form “${formName}”.`,
      },
    });
    if (person || m.email || m.phone) {
      await tx.customerContact.create({ data: { customerId: created.id, name: (person || name).slice(0, 200), email: m.email ?? "", phone: m.phone ?? "", isPrimary: true } });
    }
    await ensurePrimary(tx, created.id);
    return created;
  });
  return { id: c.id, created: true };
}

/** Does what the form is set up to do with a web submission. Returns the ids to store on the submission. */
export async function processWebSubmission(db: PrismaClient, form: Form, fields: FormField[], answers: Answers) {
  const m = mapped(fields, answers);
  const text = answersAsText(fields, answers);
  const who = m.contactPerson || m.name || m.email || m.phone || "someone";
  const customer = form.createCustomer && (m.email || m.phone || m.name || m.contactPerson) ? await findOrCreateCustomer(db, m, form.name) : null;
  let queryId: string | null = null;
  if (form.createQuery && customer) {
    const q = await db.query.create({
      data: {
        number: await nextNumberIn(db, "query"),
        customerId: customer.id,
        subject: `${form.name}: ${who}`.slice(0, 200),
        description: text.slice(0, 5000),
        category: "Web form",
        source: "Website",
        createdBy: "Website",
        notes: { create: { text: `Sent in with the web form “${form.name}”`, system: true, userName: "Kudu" } },
      },
    });
    queryId = q.id;
  }
  let taskId: string | null = null;
  if (form.createTask) {
    const picked = await autoAssign(db, { category: form.taskCategory, priority: "NORMAL", customerId: customer?.id ?? null });
    const t = await db.task.create({
      data: {
        number: await nextNumberIn(db, "task"),
        title: `${form.name}: follow up with ${who}`.slice(0, 200),
        description: [m.message, text].filter(Boolean).join("\n\n").slice(0, 5000),
        category: form.taskCategory,
        priority: "NORMAL",
        dueAt: new Date(Date.now() + 24 * 3600000),
        assignedToId: picked?.userId ?? null,
        assignedBy: picked ? `Rule: ${picked.ruleName}` : "",
        customerId: customer?.id ?? null,
        queryId,
        createdBy: "Website",
        notes: {
          create: [
            { text: `Added by the web form “${form.name}”${customer?.created ? " (new customer)" : ""}`, system: true, userName: "Kudu", createdAt: new Date(Date.now() - 1) },
            { text: picked ? `Assigned to ${picked.userName} by the rule “${picked.ruleName}”` : "No assignment rule matched, so nobody was assigned", system: true, userName: "Kudu" },
          ],
        },
      },
    });
    taskId = t.id;
  }
  return { customerId: customer?.id ?? null, queryId, taskId };
}
