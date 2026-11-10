import { NextResponse } from "next/server";
import { getUser } from "@/auth";
import { tenantDb } from "@/lib/db";
import { can } from "@/lib/permissions";
import { dayKey, fmtTime } from "@/lib/format";
import { answerText, parseFields, slugify, type Answers } from "@/lib/forms";
import { csvResponse } from "@/lib/reportsCsv";

/** All submissions of a form as CSV, one column per question. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse("Not signed in", { status: 401 });
  if (!can(user, "forms.view")) return new NextResponse("No access", { status: 403 });
  const db = await tenantDb();
  const { id } = await params;
  const form = await db.form.findUnique({ where: { id } });
  if (!form) return new NextResponse("Not found", { status: 404 });
  const fields = parseFields(form.fields).filter((f) => f.type !== "heading");
  const rows = await db.formSubmission.findMany({
    where: { formId: id },
    include: { customer: { select: { name: true } }, jobCard: { select: { number: true } } },
    orderBy: { createdAt: "asc" },
  });
  return csvResponse(
    `${slugify(form.name)}_${dayKey(new Date())}.csv`,
    ["Date", "Time", "From", "Customer", "Job card", ...fields.map((f) => f.label), "Dealt with"],
    rows.map((s) => {
      const a = (s.data ?? {}) as Answers;
      return [dayKey(s.createdAt), fmtTime(s.createdAt), s.source === "web" ? "Website" : s.submittedBy, s.customer?.name ?? "", s.jobCard?.number ?? "", ...fields.map((f) => answerText(f, a[f.id])), s.reviewedAt ? "Yes" : "No"];
    }),
  );
}
