import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import ImportWizardLoader from "@/components/import/ImportWizardLoader";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import games | Veo Analytics" };

async function SignedInWizard() {
  if (!(await getCurrentUser())) redirect("/auth");

  const supabase = await createClient();
  const [teams, players, games] = await Promise.all([
    supabase.from("teams").select("id, name").order("created_at", { ascending: false }),
    supabase.from("players").select("id, team_id, name, default_jersey").order("default_jersey"),
    supabase.from("games").select("team_id, veo_url"),
  ]);

  const failure = teams.error ?? players.error ?? games.error;
  if (failure) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Could not load your teams: {failure.message}
      </p>
    );
  }

  if (!teams.data?.length) {
    return (
      <p>
        Add your team first.{" "}
        <Link href="/onboarding" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Set up your roster
        </Link>
      </p>
    );
  }

  return (
    <ImportWizardLoader
      teams={teams.data}
      roster={players.data ?? []}
      importedGames={games.data ?? []}
    />
  );
}

export default function OnboardingGamesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Import games</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Bring your match reports over from Veo with the Chrome extension.
        </p>
      </div>
      <Suspense fallback={<div className="h-64" aria-busy="true" />}>
        <SignedInWizard />
      </Suspense>
    </div>
  );
}
