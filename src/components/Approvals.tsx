import type { ApprovalState } from "@/lib/approval";
import { fmtDateTime } from "@/lib/format";

type Action = (fd: FormData) => Promise<void>;

/**
 * The approval box on an invoice, quotation or purchase order: submit for approval, approve, or
 * send back with a reason. `ready` is shown once approved, e.g. "It can now be sent."
 */
export function ApprovalPanel({
  state,
  doc,
  canApprove,
  canRequest = true,
  actions,
  blockedText = "Needs approval before it can be sent.",
  ready,
}: {
  state: ApprovalState;
  doc: { id: string; approvedBy: string; approvedAt: Date | null; approvalNote: string; approvalRequestedBy: string; approvalRequestedAt: Date | null };
  canApprove: boolean;
  canRequest?: boolean;
  actions: { request: Action; approve: Action; reject: Action };
  blockedText?: string;
  ready?: string;
}) {
  if (state === "NOT_NEEDED") return null;
  return (
    <div className={`no-print mb-4 rounded-md border p-4 text-sm ${state === "APPROVED" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
      {state === "APPROVED" && (
        <p>
          <b>Approved</b> by {doc.approvedBy || "an admin"} on {fmtDateTime(doc.approvedAt)}.{ready && ` ${ready}`}
        </p>
      )}
      {state === "NEEDED" && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="flex-1">
            <b>{blockedText}</b>
            {doc.approvalNote && <span className="block text-kudu-700">Sent back: {doc.approvalNote}</span>}
          </p>
          {canRequest && (
            <form action={actions.request}>
              <input type="hidden" name="id" value={doc.id} />
              <button className="btn-dark py-1.5">Submit for approval</button>
            </form>
          )}
          {canApprove && (
            <form action={actions.approve}>
              <input type="hidden" name="id" value={doc.id} />
              <button className="btn-primary py-1.5">Approve</button>
            </form>
          )}
        </div>
      )}
      {state === "REQUESTED" && (
        <div className="space-y-3">
          <p>
            <b>Waiting for approval</b> · submitted by {doc.approvalRequestedBy || "office"} on {fmtDateTime(doc.approvalRequestedAt)}.
            {!canApprove && " An approver needs to approve it."}
          </p>
          {canApprove && <DecideForms id={doc.id} approve={actions.approve} reject={actions.reject} />}
        </div>
      )}
    </div>
  );
}

/** Approve, or send back with a reason (required). `returnTo` brings the approver back to the inbox. */
export function DecideForms({ id, approve, reject, returnTo, rejectLabel = "Send back" }: { id: string; approve: Action; reject: Action; returnTo?: string; rejectLabel?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={approve}>
        <input type="hidden" name="id" value={id} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <button className="btn-primary py-1.5">Approve</button>
      </form>
      <form action={reject} className="flex min-w-60 flex-1 flex-wrap gap-2">
        <input type="hidden" name="id" value={id} />
        {returnTo && <input type="hidden" name="returnTo" value={returnTo} />}
        <input name="note" required className="input min-w-40 flex-1 py-1.5" placeholder="Reason" aria-label={`Reason (${rejectLabel.toLowerCase()})`} />
        <button className="btn-outline py-1.5">{rejectLabel}</button>
      </form>
    </div>
  );
}
