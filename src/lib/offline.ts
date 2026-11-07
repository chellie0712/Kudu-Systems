// Shapes shared by the offline job page (browser) and the /api/offline routes (server).

export type OfflineChecklist = { id: string; name: string; requiredForCompletion: boolean; items: { label: string; done: boolean; note: string }[] };

/** A job as downloaded to the phone. */
export type OfflineJob = {
  id: string;
  number: string;
  status: string;
  customerName: string;
  siteAddress: string;
  siteContact: string;
  contactNumber: string;
  scheduledStart: string | null;
  jobType: string;
  scopeOfWork: string;
  areaTreated: string;
  workDescription: string;
  warrantyComments: string;
  checklists: OfflineChecklist[];
  photoCounts: { BEFORE: number; AFTER: number; EXTRA: number };
};

export type OfflinePack = {
  userId: string;
  userName: string;
  companyName: string;
  warrantyTerms: string[];
  downloadedAt: string;
  jobs: OfflineJob[];
};

export type OfflinePhoto = { id: string; kind: "BEFORE" | "AFTER" | "EXTRA"; dataUrl: string; sent?: boolean };

/** Work done on the phone without signal, waiting to be sent. One per job. */
export type OfflineDraft = {
  jobId: string;
  userId: string;
  savedAt: string;
  areaTreated: string;
  workDescription: string;
  warrantyComments: string;
  checklists: { id: string; items: { label: string; done: boolean; note: string }[] }[];
  photos: OfflinePhoto[];
  signOff: { name: string; confirmed: boolean; signature: string; rating: number | null; feedback: string; signedAt: string } | null;
  /** Result of the last attempt to send it. */
  error?: string;
};

export type SyncResult = { ok: boolean; completed: boolean; message: string };
