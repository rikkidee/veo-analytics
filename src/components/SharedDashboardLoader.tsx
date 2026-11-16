"use client";

import dynamic from "next/dynamic";

// As with DashboardLoader, charts and saved text need the browser.
const SharedDashboardLoader = dynamic(() => import("@/components/SharedDashboard"), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
      Loading…
    </p>
  ),
});

export default SharedDashboardLoader;
