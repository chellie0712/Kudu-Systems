"use client";

// The phone's own copy of the technician's jobs and of work not sent yet (IndexedDB).
import type { OfflineDraft, OfflinePack } from "@/lib/offline";

const DB = "kudu-offline";
const DRAFTS = "drafts";
const META = "meta";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DRAFTS)) db.createObjectStore(DRAFTS, { keyPath: "jobId" });
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req ? req.result : undefined);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getPack = () => run<OfflinePack | undefined>(META, "readonly", (s) => s.get("pack")) as Promise<OfflinePack | undefined>;
export const savePack = (pack: OfflinePack) => run(META, "readwrite", (s) => void s.put(pack, "pack"));

export const getDrafts = async () => ((await run<OfflineDraft[]>(DRAFTS, "readonly", (s) => s.getAll())) ?? []) as OfflineDraft[];
export const getDraft = (jobId: string) => run<OfflineDraft | undefined>(DRAFTS, "readonly", (s) => s.get(jobId)) as Promise<OfflineDraft | undefined>;
export const saveDraft = (d: OfflineDraft) => run(DRAFTS, "readwrite", (s) => void s.put(d));
export const deleteDraft = (jobId: string) => run(DRAFTS, "readwrite", (s) => void s.delete(jobId));

/** Removes everything this app stored on the phone (on sign-out). */
export async function clearOffline() {
  await run(DRAFTS, "readwrite", (s) => void s.clear());
  await run(META, "readwrite", (s) => void s.clear());
}
