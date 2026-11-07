"use client";

import { clearOffline, getDrafts } from "@/lib/offlineStore";

/** Sign-out button that also removes the jobs kept on the phone, warning first about work not sent yet. */
export function SignOutButton() {
  return (
    <button
      className="btn-outline py-1.5"
      onClick={async (e) => {
        const form = e.currentTarget.form;
        e.preventDefault();
        try {
          const unsent = (await getDrafts()).length;
          if (unsent && !confirm(`${unsent} job${unsent > 1 ? "s" : ""} saved on this phone ${unsent > 1 ? "have" : "has"} not been sent yet. Signing out deletes ${unsent > 1 ? "them" : "it"}. Sign out anyway?`)) return;
          await clearOffline();
        } catch {
          /* no offline storage on this device */
        }
        form?.requestSubmit();
      }}
    >
      Sign out
    </button>
  );
}
