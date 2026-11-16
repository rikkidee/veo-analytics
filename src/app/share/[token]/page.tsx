import type { Metadata } from "next";
import { Suspense } from "react";
import SharedDashboardLoader from "@/components/SharedDashboardLoader";
import { loadSharedTeam, type SharedTeam } from "@/lib/shared-team";

export const metadata: Metadata = {
  title: "Team Stats | Veo Analytics",
  // The link is the only thing keeping these private, so keep it out of search engines
  // and out of the Referer sent to other sites.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

async function SharedTeamView({ token }: { token: string }) {
  let shared: SharedTeam | null;
  try {
    shared = await loadSharedTeam(token);
  } catch (cause) {
    // Visitors get a plain message. The reason, such as add-share-links.sql not being run yet, goes to the server log.
    console.error("Couldn't load a shared team:", cause);
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        This link isn&apos;t working right now. Try again in a little while.
      </p>
    );
  }

  if (!shared) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">This link isn&apos;t available</h1>
        <p className="text-sm text-neutral-400">
          The coach may have turned it off or replaced it with a new one. Ask them for the current link.
        </p>
      </div>
    );
  }

  return <SharedDashboardLoader data={shared.data} teamId={shared.teamId} />;
}

/** A team's dashboard, view only, for anyone with its link. No account needed. */
export default function SharedTeamPage({ params }: PageProps<"/share/[token]">) {
  return (
    <Suspense fallback={<div className="h-64" aria-busy="true" />}>
      {params.then(({ token }) => (
        <SharedTeamView token={token} />
      ))}
    </Suspense>
  );
}
