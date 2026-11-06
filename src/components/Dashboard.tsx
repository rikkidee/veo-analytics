"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Leaderboard from "@/components/Leaderboard";
import PlayerProfile from "@/components/PlayerProfile";
import TeamOverview from "@/components/TeamOverview";
import { summarizeTeam, type DashboardData } from "@/lib/stats";

export default function Dashboard({ data }: { data: DashboardData }) {
  const [chosenTeamId, setChosenTeamId] = useState<string | null>(null);
  // Teams arrive newest first, and the newest can be empty, as saving a roster
  // always adds a team. Open on the newest one with games until someone chooses.
  const teamId =
    chosenTeamId ??
    (data.teams.find((team) => data.games.some((game) => game.team_id === team.id)) ?? data.teams[0])
      ?.id ??
    "";
  const summary = useMemo(() => summarizeTeam(data, teamId), [data, teamId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {data.teams.length > 1 && (
          <select
            aria-label="Team"
            value={teamId}
            onChange={(event) => setChosenTeamId(event.target.value)}
            className="rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
          >
            {data.teams.map((team) => {
              // The count tells apart teams that share a name.
              const count = data.games.filter((game) => game.team_id === team.id).length;
              return (
                <option key={team.id} value={team.id}>
                  {team.name} ({count} {count === 1 ? "game" : "games"})
                </option>
              );
            })}
          </select>
        )}
      </div>

      {summary.games.length === 0 ? (
        <p>
          No games yet.{" "}
          <Link
            href="/onboarding/games"
            className="font-medium text-emerald-700 underline dark:text-emerald-400"
          >
            Import your first games
          </Link>
        </p>
      ) : (
        <>
          <TeamOverview key={`overview-${teamId}`} summary={summary} />
          <div className="grid gap-6 md:grid-cols-2">
            <Leaderboard key={`leaderboard-${teamId}`} summary={summary} />
            <PlayerProfile key={`profile-${teamId}`} summary={summary} />
          </div>
        </>
      )}
    </div>
  );
}
