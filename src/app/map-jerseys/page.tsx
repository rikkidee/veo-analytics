import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import SavedGameMapper from "@/components/SavedGameMapper";
import { loadDashboardData, loadMappingCoverage } from "@/lib/dashboard-data";
import { isMinutesColumn, readStat, type DashboardData } from "@/lib/stats";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Map jerseys | Veo Analytics" };

async function SignedInMapper() {
  if (!(await getCurrentUser())) redirect("/auth");

  const supabase = await createClient();
  let data: DashboardData;
  let coverage: Awaited<ReturnType<typeof loadMappingCoverage>>;
  try {
    [data, coverage] = await Promise.all([loadDashboardData(supabase), loadMappingCoverage(supabase)]);
  } catch (cause) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Could not load your games: {(cause as Error).message}
      </p>
    );
  }

  if (data.games.length === 0) {
    return (
      <p>
        No saved games yet.{" "}
        <Link href="/onboarding/games" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Import your first games
        </Link>
      </p>
    );
  }

  const seasonMinutes: Record<string, Record<string, number>> = {};
  for (const row of data.stats) {
    const column = Object.keys(row.stats).find(isMinutesColumn);
    const minutes = column === undefined ? null : readStat(column, row.stats[column]);
    if (minutes !== null) (seasonMinutes[row.player_id] ??= {})[row.game_id] = minutes;
  }

  return (
    <SavedGameMapper
      games={data.games
        .toSorted((a, b) => b.game_date.localeCompare(a.game_date) || a.id.localeCompare(b.id))
        .map((game) => ({
          id: game.id,
          game_label: game.game_label,
          game_date: game.game_date,
          unassigned: coverage[game.id]?.unassigned ?? null,
        }))}
      roster={data.players.map((player) => ({
        id: player.id,
        team_id: player.team_id,
        name: player.name,
        default_jersey: player.default_jersey,
      }))}
      seasonMinutes={seasonMinutes}
    />
  );
}

export default function MapJerseysPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Map jerseys</h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Optional, and you can stop any time. Your dashboard already works, and this makes it more complete.
        </p>
        <p className="mt-3">
          Notice how some players show fewer minutes than expected? That&apos;s because Veo sometimes reads jersey
          numbers incorrectly. By mapping these unmatched jerseys to the right players, you&apos;ll get the complete
          picture.
        </p>
        {/* A screenshot of Veo misreading a jersey goes here. */}
      </div>
      <Suspense fallback={<div className="h-64" aria-busy="true" />}>
        <SignedInMapper />
      </Suspense>
    </div>
  );
}
