"use client";

import dynamic from "next/dynamic";

// The import arrives in the URL fragment, which only exists in the browser.
const GameImport = dynamic(() => import("@/components/GameImport"), {
  ssr: false,
});

export default function OnboardingGamesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Import a game</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Step 2 of 2. On a Veo match report, open the extension, click Scrape
          This Game, then Send to Veo Analytics.
        </p>
      </div>
      <GameImport />
    </div>
  );
}
