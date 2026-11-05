"use client";

import dynamic from "next/dynamic";

// The wizard restores from sessionStorage and talks to the extension, and both
// exist only in the browser.
const ImportWizardLoader = dynamic(() => import("@/components/import/ImportWizard"), {
  ssr: false,
});

export default ImportWizardLoader;
