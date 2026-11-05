"use client";

import dynamic from "next/dynamic";

// The wizard restores from sessionStorage and talks to the extension, and both
// exist only in the browser.
const ImportWizardLoader = dynamic(() => import("@/components/import/ImportWizard"), {
  ssr: false,
  loading: () => (
    <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
      Loading…
    </p>
  ),
});

export default ImportWizardLoader;
