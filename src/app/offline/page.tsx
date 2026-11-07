import { OfflineApp } from "@/components/OfflineApp";

export const metadata = { title: "My jobs (offline)" };

/**
 * Static page the service worker keeps on the phone. It needs no server data: everything it shows
 * comes from the phone's own store, filled while the technician had signal.
 */
export default function OfflinePage() {
  return <OfflineApp />;
}
