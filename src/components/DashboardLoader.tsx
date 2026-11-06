"use client";

import dynamic from "next/dynamic";

// Charts draw on a canvas and saved text is parsed with DOMParser, and both exist
// only in the browser.
const DashboardLoader = dynamic(() => import("@/components/Dashboard"), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
      Loading…
    </p>
  ),
});

export default DashboardLoader;
