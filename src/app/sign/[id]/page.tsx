import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePermission } from "@/auth";
import { canAccessJobCard } from "@/lib/permissions";
import { tenantDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { lines } from "@/lib/jobcard";
import { incompleteRequired, parseItems } from "@/lib/checklists";
import { fmtQty } from "@/lib/inventory";
import { signOffJobCard } from "@/app/actions/jobCards";
import { CompanyLogo } from "@/components/CompanyLogo";
import { SignaturePad } from "@/components/JobCardEditors";
import { SignOffSubmit, StarRating, Stars } from "@/components/SignOff";

export const metadata = { title: "Client sign-off" };

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  if (!v) return null;
  return (
    <div className="border-b border-charcoal-100 py-2 last:border-0">
      <div className="text-xs font-semibold text-charcoal-500">{k}</div>
      <div className="text-sm whitespace-pre-line">{v}</div>
    </div>
  );
}

/** Full-screen page the technician hands to the client to sign off the job on the phone. */
export default async function SignOffPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string; done?: string }> }) {
  const user = await requirePermission("jobcards.edit");
  const db = await tenantDb();
  const { id } = await params;
  const { err, done } = await searchParams;
  const [j, settings] = await Promise.all([
    db.jobCard.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        checklists: { orderBy: { sortOrder: "asc" } },
        assetChecks: { select: { result: true } },
        stockMovements: { where: { kind: "USE" }, include: { item: { select: { name: true, unit: true } } }, orderBy: { createdAt: "asc" } },
      },
    }),
    getSettings(),
  ]);
  if (!j) notFound();
  if (!canAccessJobCard(user, j)) redirect("/no-access?need=jobcards.viewAll");

  const checklists = j.checklists.map((l) => ({ ...l, items: parseItems(l.items) }));
  const unfinished = incompleteRequired(checklists);
  const blockers = [
    !j.workDescription.trim() && "The description of the work done is empty.",
    unfinished.length > 0 && `The ${unfinished.join(", ")} checklist${unfinished.length > 1 ? "s are" : " is"} not finished.`,
  ].filter(Boolean) as string[];
  const signed = j.status === "COMPLETED" && j.signedAt;
  const ingredients = [...j.activeIngredients, ...(j.activeIngredientOther ? [j.activeIngredientOther] : [])];
  const used = new Map<string, number>();
  for (const m of j.stockMovements) {
    const label = `${m.item.name}|${m.item.unit}`;
    used.set(label, (used.get(label) ?? 0) + m.quantity);
  }

  return (
    <div className="min-h-screen bg-charcoal-50">
      <header className="flex items-center justify-between gap-3 border-b-2 border-kudu-600 bg-white px-4 py-2">
        <CompanyLogo logo={settings.logo} name={settings.companyName} className="h-12 w-auto" />
        <Link href={`/job-cards/${j.id}`} className="text-sm font-medium text-charcoal-600 hover:text-kudu-600">← Job card</Link>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-5">
        <div>
          <h1 className="text-2xl font-extrabold text-charcoal-800">{signed ? "Job signed off" : "Job sign-off"}</h1>
          <p className="text-sm text-charcoal-600">
            {j.number} · {j.customer.name} · {fmtDate(j.jobDate ?? new Date())}
          </p>
        </div>

        {err && <div className="rounded-md bg-kudu-50 p-3 text-sm font-medium text-kudu-700">{err}</div>}

        {signed ? (
          <div className="card space-y-3 p-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
            {done && <p className="text-lg font-semibold">Thank you{j.customerSignName ? `, ${j.customerSignName.split(" ")[0]}` : ""}.</p>}
            <p className="text-sm text-charcoal-600">
              Signed by {j.customerSignName || "the client"} on {fmtDateTime(j.signedAt)}. The job is marked completed.
            </p>
            {j.customerRating && <p className="text-2xl"><Stars rating={j.customerRating} /></p>}
            {j.customerFeedback && <p className="text-sm whitespace-pre-line text-charcoal-700 italic">“{j.customerFeedback}”</p>}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {j.customerSignature && <img src={j.customerSignature} alt="Client signature" className="mx-auto max-h-24" />}
            <div className="flex flex-col gap-2 pt-2 sm:flex-row sm:justify-center">
              <Link href={`/job-cards/${j.id}`} className="btn-primary py-2.5">Open job card</Link>
              <Link href="/" className="btn-outline py-2.5">My jobs</Link>
            </div>
          </div>
        ) : (
          <>
            <section className="card p-5">
              <h2 className="mb-1 text-xs font-bold tracking-wide text-kudu-700 uppercase">Work carried out</h2>
              <Row k="Site" v={j.siteAddress} />
              <Row k="Technician" v={j.technician} />
              <Row k="Area / pest treated" v={j.areaTreated} />
              <Row k="Work done" v={j.workDescription} />
              <Row
                k="Products used"
                v={used.size > 0 && [...used].map(([label, qty]) => { const [name, unit] = label.split("|"); return `${name}: ${fmtQty(qty, unit)}`; }).join("\n")}
              />
              <Row k="Active ingredients" v={ingredients.join(", ")} />
              <Row k="Checklists" v={checklists.length > 0 && checklists.map((l) => `${l.name}: ${l.items.filter((i) => i.done).length} of ${l.items.length} done`).join("\n")} />
              <Row k="Site assets checked" v={j.assetChecks.length > 0 && `${j.assetChecks.length} checked`} />
              <Row k="Warranty" v={[j.warrantyNo || j.number, j.warrantyStart && `from ${fmtDate(j.warrantyStart)}`, j.warrantyEnd && `to ${fmtDate(j.warrantyEnd)}`].filter(Boolean).join(" ")} />
              <Row k="Warranty covers" v={j.warrantyCovers.join(", ")} />
              <Row k="Comments / recommendations" v={j.warrantyComments} />
            </section>

            {lines(settings.warrantyTerms).length > 0 && (
              <details className="card p-5">
                <summary className="cursor-pointer text-sm font-semibold text-kudu-600">Read the warranty terms &amp; conditions</summary>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                  {lines(settings.warrantyTerms).map((t) => <li key={t}>{t}</li>)}
                </ul>
              </details>
            )}

            {blockers.length > 0 ? (
              <div className="card space-y-2 border-l-4 border-l-amber-500 p-5">
                <p className="font-semibold">The technician needs to finish the job card before the client can sign.</p>
                <ul className="list-disc pl-5 text-sm text-charcoal-700">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                <Link href={`/job-cards/${j.id}/edit`} className="btn-primary mt-2 inline-block">Finish the job card</Link>
              </div>
            ) : (
              <form action={signOffJobCard} className="card space-y-5 p-5">
                <input type="hidden" name="id" value={j.id} />
                <label className="block">
                  <span className="label">Your name</span>
                  <input name="customerSignName" className="input py-2.5 text-base" defaultValue={j.customerSignName || j.siteContact} autoComplete="name" />
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="checkbox" name="clientConfirmed" className="mt-0.5 h-6 w-6 shrink-0 accent-kudu-600" />
                  <span>I confirm the work above was carried out to my satisfaction on the date shown, and I accept the Warranty Terms &amp; Conditions.</span>
                </label>
                <SignaturePad name="customerSignature" label="Signature" height={320} canvasClassName="h-56" />
                <div>
                  <span className="label">How did we do?</span>
                  <StarRating name="rating" />
                </div>
                <label className="block">
                  <span className="label">Comments (optional)</span>
                  <textarea name="feedback" rows={3} maxLength={2000} className="input text-base" placeholder="Anything you'd like us to know" />
                </label>
                <SignOffSubmit />
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}
