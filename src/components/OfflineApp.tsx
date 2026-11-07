"use client";

import { useCallback, useEffect, useState } from "react";
import type { OfflineChecklist, OfflineDraft, OfflineJob, OfflinePack, OfflinePhoto } from "@/lib/offline";
import { deleteDraft, getDrafts, getPack, saveDraft } from "@/lib/offlineStore";
import { downloadJobs, sendDrafts } from "@/lib/offlineSync";
import { compress, SignaturePad } from "@/components/JobCardEditors";
import { StarRating } from "@/components/SignOff";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Not scheduled";

const photoId = () => {
  const b = crypto.getRandomValues(new Uint8Array(18));
  return "off_" + btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** The technician's jobs kept on the phone: works with no signal, sends the work when the signal is back. */
export function OfflineApp() {
  const online = useOnline();
  const [pack, setPack] = useState<OfflinePack | null>(null);
  const [drafts, setDrafts] = useState<OfflineDraft[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [p, d] = await Promise.all([getPack(), getDrafts()]);
    setPack(p ?? null);
    setDrafts(d);
    setLoaded(true);
  }, []);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      const report = await sendDrafts();
      const fresh = report.stopped ? null : await downloadJobs().catch(() => null);
      const parts = [...report.messages, report.stopped, fresh && "Jobs updated."].filter(Boolean);
      setStatus(parts.join(" ") || (fresh ? "Jobs updated." : "Could not reach the server."));
    } catch {
      setStatus("No connection. Your work is still saved on this phone.");
    } finally {
      setBusy(false);
      await reload();
    }
  }, [reload]);

  useEffect(() => {
    void reload();
  }, [reload]);
  // Send automatically when the signal comes back.
  useEffect(() => {
    if (online && loaded) void sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, loaded]);

  const job = pack?.jobs.find((j) => j.id === openId) ?? null;
  const draftJobs = drafts.filter((d) => !pack?.jobs.some((j) => j.id === d.jobId));

  return (
    <div className="min-h-screen bg-charcoal-50">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b-2 border-kudu-600 bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="truncate font-extrabold text-charcoal-800">{pack?.companyName || "Kudu Systems"} · My jobs</div>
          <div className={`text-xs font-semibold ${online ? "text-emerald-700" : "text-amber-700"}`}>
            {online ? "Online" : "No signal: working offline"}
            {pack && <span className="font-normal text-charcoal-500"> · downloaded {new Date(pack.downloadedAt).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
          </div>
        </div>
        {online ? (
          // A full page load on purpose: the rest of the app needs the server.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/" className="btn-outline shrink-0 py-1.5 text-sm">Full app</a>
        ) : null}
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        {(status || drafts.length > 0) && (
          <div className="card space-y-2 p-3 text-sm">
            {drafts.length > 0 && (
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-amber-800">{drafts.length} job{drafts.length > 1 ? "s" : ""} saved on this phone, not sent yet</span>
                {online && <button className="btn-primary py-1 text-xs" disabled={busy} onClick={() => void sync()}>{busy ? "Sending…" : "Send now"}</button>}
              </div>
            )}
            {status && <p className="text-charcoal-600">{status}</p>}
          </div>
        )}

        {!loaded ? null : job ? (
          <JobEditor
            key={job.id}
            job={job}
            pack={pack!}
            draft={drafts.find((d) => d.jobId === job.id) ?? null}
            onClose={() => setOpenId(null)}
            onSaved={async (msg) => {
              setOpenId(null);
              setStatus(msg);
              await reload();
              if (navigator.onLine) void sync();
            }}
          />
        ) : !pack ? (
          <div className="card p-5 text-sm">
            <p className="font-semibold">No jobs saved on this phone yet.</p>
            <p className="mt-1 text-charcoal-600">Open the app once while you have signal and sign in; your open jobs are then kept on the phone automatically.</p>
            {online && <button className="btn-primary mt-3" disabled={busy} onClick={() => void sync()}>Download my jobs now</button>}
          </div>
        ) : (
          <>
            {pack.jobs.length === 0 && <div className="card p-5 text-sm text-charcoal-600">No open jobs are assigned to you.</div>}
            <ul className="space-y-3">
              {pack.jobs.map((j) => {
                const d = drafts.find((x) => x.jobId === j.id);
                return (
                  <li key={j.id} className="card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-kudu-700">{j.number}</span>
                      {d ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.error ? "bg-kudu-100 text-kudu-800" : "bg-amber-100 text-amber-800"}`}>
                          {d.error ? "Needs attention" : d.signOff ? "Signed, not sent" : "Saved, not sent"}
                        </span>
                      ) : null}
                    </div>
                    <div className="text-sm font-semibold">{j.customerName}</div>
                    <div className="text-sm text-charcoal-600">{[when(j.scheduledStart), j.jobType].filter(Boolean).join(" · ")}</div>
                    {j.siteAddress && <div className="text-sm whitespace-pre-line text-charcoal-700">{j.siteAddress}</div>}
                    {d?.error && <p className="mt-1 text-sm text-kudu-700">{d.error}</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {j.contactNumber ? <a href={`tel:${j.contactNumber.replace(/[^\d+]/g, "")}`} className="btn-outline py-2 text-center">Call</a> : <span />}
                      <button className="btn-primary py-2" onClick={() => setOpenId(j.id)}>{d ? "Continue" : "Fill in & sign off"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {draftJobs.length > 0 && !job && (
          <div className="card space-y-2 p-4 text-sm">
            <p className="font-semibold">Saved work for jobs no longer on your list</p>
            {draftJobs.map((d) => (
              <div key={d.jobId} className="flex items-center justify-between gap-2">
                <span className="text-charcoal-600">{d.error || "Waiting to send"}</span>
                <button
                  className="text-xs text-charcoal-500 underline"
                  onClick={async () => {
                    if (!confirm("Delete this saved work from the phone? It has not been sent.")) return;
                    await deleteDraft(d.jobId);
                    await reload();
                  }}
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function PhotoInput({ label, kind, photos, setPhotos, uploaded }: { label: string; kind: OfflinePhoto["kind"]; photos: OfflinePhoto[]; setPhotos: (p: OfflinePhoto[]) => void; uploaded: number }) {
  const mine = photos.filter((p) => p.kind === kind);
  return (
    <div>
      <div className="mb-1 text-xs font-semibold text-charcoal-600">
        {label}
        {uploaded > 0 && <span className="font-normal text-charcoal-400"> · {uploaded} already on the job card</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        {mine.map((p) => (
          <div key={p.id} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.dataUrl} alt={label} className="h-20 w-20 rounded-md object-cover" />
            {!p.sent && (
              <button type="button" className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-charcoal-800 text-xs text-white" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((x) => x.id !== p.id))}>
                ×
              </button>
            )}
          </div>
        ))}
        <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border-2 border-dashed border-charcoal-300 text-xs text-charcoal-500">
          + Photo
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const dataUrl = await compress(file);
              const keep = kind === "EXTRA" ? photos : photos.filter((x) => x.kind !== kind || x.sent);
              setPhotos([...keep, { id: photoId(), kind, dataUrl }]);
            }}
          />
        </label>
      </div>
    </div>
  );
}

function JobEditor({ job, pack, draft, onClose, onSaved }: { job: OfflineJob; pack: OfflinePack; draft: OfflineDraft | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [lists, setLists] = useState<OfflineChecklist[]>(() =>
    job.checklists.map((l) => {
      const saved = draft?.checklists.find((c) => c.id === l.id);
      return saved ? { ...l, items: l.items.map((it) => saved.items.find((s) => s.label === it.label) ?? it) } : l;
    }),
  );
  const [photos, setPhotos] = useState<OfflinePhoto[]>(draft?.photos ?? []);
  const [error, setError] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const get = (n: string) => String(fd.get(n) ?? "").trim();
        const signature = get("customerSignature");
        const wantsSignOff = Boolean(signature);
        if (wantsSignOff) {
          const unfinished = lists.filter((l) => l.requiredForCompletion && l.items.some((i) => !i.done)).map((l) => l.name);
          const missing = [
            !get("workDescription") && "describe the work done",
            unfinished.length > 0 && `tick everything on ${unfinished.join(", ")}`,
            !get("customerSignName") && "enter the client's name",
            fd.get("clientConfirmed") !== "on" && "tick the confirmation box",
          ].filter(Boolean);
          if (missing.length) {
            setError(`Before sign-off, please ${missing.join(", ")}. Or clear the signature to save without signing off.`);
            return;
          }
        }
        const rating = Number(get("rating"));
        await saveDraft({
          jobId: job.id,
          userId: pack.userId,
          savedAt: new Date().toISOString(),
          areaTreated: get("areaTreated"),
          workDescription: get("workDescription"),
          warrantyComments: get("warrantyComments"),
          checklists: lists.map((l) => ({ id: l.id, items: l.items })),
          photos,
          signOff: wantsSignOff
            ? {
                name: get("customerSignName"),
                confirmed: fd.get("clientConfirmed") === "on",
                signature,
                rating: rating >= 1 && rating <= 5 ? rating : null,
                feedback: get("feedback"),
                signedAt: draft?.signOff?.signature === signature ? draft.signOff.signedAt : new Date().toISOString(),
              }
            : null,
        });
        onSaved(navigator.onLine ? `${job.number} saved. Sending…` : `${job.number} saved on this phone. It will be sent when you have signal.`);
      }}
    >
      <button type="button" className="text-sm text-charcoal-500" onClick={onClose}>← My jobs</button>
      <div>
        <h1 className="text-xl font-extrabold">{job.number}</h1>
        <p className="text-sm text-charcoal-600">{job.customerName} · {when(job.scheduledStart)}</p>
      </div>
      {draft?.error && <p className="rounded-md bg-kudu-50 p-3 text-sm text-kudu-700">{draft.error}</p>}

      <section className="card space-y-3 p-4 text-sm">
        {job.siteAddress && <div><div className="text-xs font-semibold text-charcoal-500">Site</div><div className="whitespace-pre-line">{job.siteAddress}</div></div>}
        {(job.siteContact || job.contactNumber) && <div><div className="text-xs font-semibold text-charcoal-500">Contact</div><div>{[job.siteContact, job.contactNumber].filter(Boolean).join(" · ")}</div></div>}
        {job.scopeOfWork && <div><div className="text-xs font-semibold text-charcoal-500">Scope / instructions</div><div className="whitespace-pre-line">{job.scopeOfWork}</div></div>}
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-xs font-bold tracking-wide text-kudu-700 uppercase">Work performed</h2>
        <label className="block">
          <span className="label">Area / pest treated</span>
          <input name="areaTreated" className="input text-base" defaultValue={draft?.areaTreated ?? job.areaTreated} />
        </label>
        <label className="block">
          <span className="label">Description of work done</span>
          <textarea name="workDescription" rows={4} className="input text-base" defaultValue={draft?.workDescription ?? job.workDescription} />
        </label>
        <label className="block">
          <span className="label">Comments / recommendations</span>
          <textarea name="warrantyComments" rows={2} className="input text-base" defaultValue={draft?.warrantyComments ?? job.warrantyComments} />
        </label>
      </section>

      {lists.length > 0 && (
        <section className="card space-y-4 p-4">
          <h2 className="text-xs font-bold tracking-wide text-kudu-700 uppercase">Checklists</h2>
          {lists.map((l, li) => (
            <div key={l.id}>
              <div className="mb-1 text-sm font-semibold">
                {l.name}
                {l.requiredForCompletion && <span className="ml-1 text-xs font-normal text-kudu-700">required</span>}
              </div>
              <ul className="space-y-1">
                {l.items.map((it, ii) => (
                  <li key={ii}>
                    <label className="flex items-start gap-3 py-1 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-5 w-5 shrink-0 accent-kudu-600"
                        checked={it.done}
                        onChange={(e) => setLists(lists.map((x, xi) => (xi !== li ? x : { ...x, items: x.items.map((y, yi) => (yi === ii ? { ...y, done: e.target.checked } : y)) })))}
                      />
                      <span>{it.label}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-3 p-4">
        <h2 className="text-xs font-bold tracking-wide text-kudu-700 uppercase">Photos</h2>
        <PhotoInput label="Before" kind="BEFORE" photos={photos} setPhotos={setPhotos} uploaded={job.photoCounts.BEFORE} />
        <PhotoInput label="After" kind="AFTER" photos={photos} setPhotos={setPhotos} uploaded={job.photoCounts.AFTER} />
        <PhotoInput label="More photos" kind="EXTRA" photos={photos} setPhotos={setPhotos} uploaded={job.photoCounts.EXTRA} />
      </section>

      <section className="card space-y-4 p-4">
        <h2 className="text-xs font-bold tracking-wide text-kudu-700 uppercase">Client sign-off</h2>
        {pack.warrantyTerms.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-kudu-600">Read the warranty terms &amp; conditions</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">{pack.warrantyTerms.map((t) => <li key={t}>{t}</li>)}</ul>
          </details>
        )}
        <label className="block">
          <span className="label">Client&apos;s name</span>
          <input name="customerSignName" className="input text-base" defaultValue={draft?.signOff?.name ?? job.siteContact} />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" name="clientConfirmed" className="mt-0.5 h-6 w-6 shrink-0 accent-kudu-600" defaultChecked={draft?.signOff?.confirmed ?? false} />
          <span>I confirm the work above was carried out to my satisfaction on the date shown, and I accept the Warranty Terms &amp; Conditions.</span>
        </label>
        <SignaturePad name="customerSignature" label="Client signature" initial={draft?.signOff?.signature} height={320} canvasClassName="h-56" />
        <div>
          <span className="label">How did we do? (client)</span>
          <StarRating name="rating" />
        </div>
        <label className="block">
          <span className="label">Client&apos;s comments (optional)</span>
          <textarea name="feedback" rows={2} className="input text-base" defaultValue={draft?.signOff?.feedback ?? ""} />
        </label>
        <p className="text-xs text-charcoal-500">Leave the signature empty to save your work without signing off.</p>
      </section>

      {error && <p className="rounded-md bg-kudu-50 p-3 text-sm font-medium text-kudu-700">{error}</p>}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-charcoal-200 bg-white px-4 py-3">
        <button className="btn-primary flex-1 py-3 text-base">Save</button>
        {draft && (
          <button
            type="button"
            className="btn-outline py-3"
            onClick={async () => {
              if (!confirm("Throw away the work saved on this phone for this job?")) return;
              await deleteDraft(job.id);
              onSaved(`${job.number}: saved work thrown away.`);
            }}
          >
            Discard
          </button>
        )}
      </div>
    </form>
  );
}
