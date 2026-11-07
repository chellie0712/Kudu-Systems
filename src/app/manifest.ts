import type { MetadataRoute } from "next";

/** Lets technicians add the app to their phone's home screen; the service worker keeps it usable offline. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kudu Systems",
    short_name: "Kudu",
    description: "Kudu Systems CRM & BPA Online System",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#9b1530",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
