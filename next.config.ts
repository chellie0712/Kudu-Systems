import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Signatures are sent as PNG data URLs with the form; photos upload separately.
    serverActions: { bodySizeLimit: "4mb" },
  },
};

export default nextConfig;
