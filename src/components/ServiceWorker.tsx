"use client";

import { useEffect } from "react";

/** Installs the service worker that keeps the offline job page on the phone. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Keep the cached offline page in step with the deployed app.
        if (navigator.onLine) (reg.active ?? reg.waiting ?? reg.installing)?.postMessage("refresh-offline");
      })
      .catch(() => undefined);
  }, []);
  return null;
}
