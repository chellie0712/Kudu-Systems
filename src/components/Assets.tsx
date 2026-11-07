import type { AssetCheck, CustomerAsset } from "@prisma/client";
import Link from "next/link";
import { deleteAsset, saveAsset, saveAssetChecks } from "@/app/actions/assets";
import { ASSET_ALERTS, ASSET_RESULTS, nextServiceDue } from "@/lib/assets";
import { fmtDate, toDateInput } from "@/lib/format";
import { ConfirmButton } from "./ConfirmButton";
import { Empty, SectionTitle } from "./ui";

const label = (a: Pick<CustomerAsset, "code" | "name">) => [a.code, a.name].filter(Boolean).join(" · ");

export function ResultText({ result }: { result: string }) {
  return <span className={ASSET_ALERTS.includes(result) ? "font-semibold text-kudu-700" : ""}>{result}</span>;
}

/** Suggestions for the asset name field; rendered once per page. */
const AssetNames = () => (
  <datalist id="asset-names">
    {["Bait station", "Rodent trap", "Fly unit", "Insect monitor", "Glue board", "Bird spikes", "Termite station"].map((n) => <option key={n} value={n} />)}
  </datalist>
);

/** The fields of an asset; used on the customer's Assets tab and on the job card. */
function AssetFields({ asset }: { asset?: CustomerAsset }) {
  return (
    <>
      <label className="block w-28">
        <span className="label">Code / no.</span>
        <input name="code" defaultValue={asset?.code} className="input" placeholder="BS-01" />
      </label>
      <label className="block min-w-40 flex-1">
        <span className="label">Asset</span>
        <input name="name" required defaultValue={asset?.name} list="asset-names" className="input" placeholder="e.g. Bait station" />
      </label>
      <label className="block min-w-40 flex-1">
        <span className="label">Location on site</span>
        <input name="location" defaultValue={asset?.location} className="input" placeholder="e.g. Kitchen, back door" />
      </label>
      <label className="block w-36">
        <span className="label">Serial no.</span>
        <input name="serialNumber" defaultValue={asset?.serialNumber} className="input" />
      </label>
      <label className="block w-40">
        <span className="label">Installed</span>
        <input name="installedAt" type="date" defaultValue={toDateInput(asset?.installedAt ?? null)} className="input" />
      </label>
      <label className="block w-32">
        <span className="label">Service every</span>
        <select name="serviceMonths" defaultValue={String(asset?.serviceMonths ?? 0)} className="input">
          <option value="0">No interval</option>
          {[1, 2, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} month{m === 1 ? "" : "s"}</option>)}
        </select>
      </label>
      <label className="block w-full">
        <span className="label">Notes</span>
        <input name="notes" defaultValue={asset?.notes} className="input" />
      </label>
    </>
  );
}

type AssetWithChecks = CustomerAsset & {
  checks: (AssetCheck & { jobCard: { id: string; number: string } })[];
};

/** Customer profile → Assets tab. */
export function CustomerAssetsTab({ customerId, assets, canEdit, canDelete }: { customerId: string; assets: AssetWithChecks[]; canEdit: boolean; canDelete: boolean }) {
  const now = new Date();
  return (
    <div className="space-y-6">
      <AssetNames />
      <div className="card overflow-x-auto">
        {assets.length === 0 ? (
          <Empty>No assets yet. Add the equipment on this customer&apos;s site, e.g. bait stations or fly units, so technicians can record each check.</Empty>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Location</th>
                <th>Last check</th>
                <th>Next due</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => {
                const last = a.checks[0];
                const due = nextServiceDue(a, last?.checkedAt ?? null);
                return (
                  <tr key={a.id} className={a.active ? "" : "text-charcoal-400"}>
                    <td className="min-w-36 align-top">
                      <div className="font-medium">{label(a)}</div>
                      <div className="text-xs text-charcoal-500">
                        {[a.serialNumber && `S/N ${a.serialNumber}`, a.installedAt && `installed ${fmtDate(a.installedAt)}`, !a.active && "inactive"].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="min-w-32 align-top text-sm">{a.location}</td>
                    <td className="min-w-40 align-top text-sm">
                      {last ? (
                        <>
                          <ResultText result={last.result} /> · {fmtDate(last.checkedAt)}
                          <div className="text-xs"><Link href={`/job-cards/${last.jobCard.id}`} className="text-kudu-600 hover:underline">{last.jobCard.number}</Link>{last.note && ` · ${last.note}`}</div>
                        </>
                      ) : (
                        <span className="text-charcoal-400">Never</span>
                      )}
                    </td>
                    <td className={`align-top text-sm whitespace-nowrap ${due && due < now && a.active ? "font-semibold text-kudu-700" : ""}`}>{due ? fmtDate(due) : "—"}</td>
                    <td className="align-top">
                      <details className="text-sm">
                        <summary className="cursor-pointer text-kudu-600">{canEdit ? "Edit / history" : "History"}</summary>
                        <div className="mt-2 w-[min(80vw,640px)] space-y-3 rounded-md border border-charcoal-200 bg-white p-3 shadow-sm">
                          {canEdit && (
                            <form action={saveAsset} className="flex flex-wrap items-end gap-2">
                              <input type="hidden" name="id" value={a.id} />
                              <input type="hidden" name="customerId" value={customerId} />
                              <AssetFields asset={a} />
                              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={a.active} className="accent-kudu-600" /> Active</label>
                              <button className="btn-primary ml-auto py-1.5">Save</button>
                            </form>
                          )}
                          <div>
                            <div className="mb-1 text-xs font-bold text-charcoal-600 uppercase">Service history</div>
                            {a.checks.length === 0 ? (
                              <p className="text-charcoal-500">No checks yet.</p>
                            ) : (
                              <ul className="space-y-0.5">
                                {a.checks.map((c) => (
                                  <li key={c.id}>
                                    {fmtDate(c.checkedAt)} · <Link href={`/job-cards/${c.jobCard.id}`} className="text-kudu-600 hover:underline">{c.jobCard.number}</Link> · <ResultText result={c.result} />
                                    {c.note && ` · ${c.note}`} <span className="text-charcoal-400">({c.userName})</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          {canDelete && (
                            <form action={deleteAsset} className="text-right">
                              <input type="hidden" name="id" value={a.id} />
                              <ConfirmButton message={`Delete ${label(a)} and its service history? To keep the history, untick Active instead.`} className="text-xs text-charcoal-400 hover:text-kudu-600">Delete asset</ConfirmButton>
                            </form>
                          )}
                        </div>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      {canEdit && (
        <div className="card p-6">
          <SectionTitle>Add an asset</SectionTitle>
          <form action={saveAsset} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="customerId" value={customerId} />
            <AssetFields />
            <button className="btn-primary ml-auto">+ Add asset</button>
          </form>
        </div>
      )}
    </div>
  );
}

/** Job card page: record a result for each of the customer's assets on this visit. */
export function JobAssetsSection({
  jobCardId,
  assets,
  checks,
}: {
  jobCardId: string;
  assets: CustomerAsset[];
  checks: AssetCheck[];
}) {
  const byAsset = new Map(checks.map((c) => [c.assetId, c]));
  const shown = assets.filter((a) => a.active || byAsset.has(a.id));
  return (
    <div id="assets" className="no-print card mx-auto mt-6 max-w-3xl p-6">
      <SectionTitle>Site assets</SectionTitle>
      <AssetNames />
      {shown.length === 0 ? (
        <p className="text-sm text-charcoal-500">This customer has no assets recorded. Add one below if you installed or found equipment on site.</p>
      ) : (
        <form action={saveAssetChecks}>
          <input type="hidden" name="jobCardId" value={jobCardId} />
          <div className="divide-y divide-charcoal-100">
            {shown.map((a) => {
              const c = byAsset.get(a.id);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <div className="min-w-40 flex-1 text-sm">
                    <div className="font-medium">{label(a)}</div>
                    {a.location && <div className="text-xs text-charcoal-500">{a.location}</div>}
                  </div>
                  <select name={`result_${a.id}`} defaultValue={c?.result ?? ""} className="input w-52 py-1.5" aria-label={`Result for ${label(a)}`}>
                    <option value="">Not checked</option>
                    {ASSET_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <input name={`note_${a.id}`} defaultValue={c?.note} className="input w-56 py-1.5" placeholder="Note (optional)" aria-label={`Note for ${label(a)}`} />
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button className="btn-primary">Save asset checks</button>
            <span className="text-xs text-charcoal-500">The results print on the job card.</span>
          </div>
        </form>
      )}
      <details className="mt-4 border-t border-charcoal-100 pt-4">
        <summary className="cursor-pointer text-sm font-medium text-kudu-600">+ Add an asset to this customer</summary>
        <form action={saveAsset} className="mt-3 flex flex-wrap items-end gap-2">
          <input type="hidden" name="jobCardId" value={jobCardId} />
          <AssetFields />
          <button className="btn-outline ml-auto">Add asset</button>
        </form>
      </details>
    </div>
  );
}

/** Printed section of the job card listing the asset checks. */
export function AssetChecksPrint({ checks }: { checks: (AssetCheck & { asset: Pick<CustomerAsset, "code" | "name" | "location"> })[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-charcoal-200 text-left text-xs text-charcoal-500">
          <th className="py-1 pr-2">Asset</th>
          <th className="py-1 pr-2">Location</th>
          <th className="py-1 pr-2">Result</th>
          <th className="py-1">Note</th>
        </tr>
      </thead>
      <tbody>
        {checks.map((c) => (
          <tr key={c.id} className="border-b border-charcoal-100">
            <td className="py-1 pr-2 font-medium">{label(c.asset)}</td>
            <td className="py-1 pr-2">{c.asset.location}</td>
            <td className="py-1 pr-2"><ResultText result={c.result} /></td>
            <td className="py-1">{c.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
