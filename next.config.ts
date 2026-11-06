import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // These were pages, and are now tools on the dashboard. The extension's popup
  // links to the import one, and installed copies keep that link until they update.
  async redirects() {
    return [
      { source: "/onboarding", destination: "/dashboard?panel=roster", permanent: false },
      { source: "/onboarding/games", destination: "/dashboard?panel=import", permanent: false },
      { source: "/map-jerseys", destination: "/dashboard?panel=map", permanent: false },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
