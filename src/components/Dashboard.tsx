"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Leaderboard from "@/components/Leaderboard";
import PlayerProfile from "@/components/PlayerProfile";
import TeamOverview from "@/components/TeamOverview";
import { summarizeTeam, type DashboardData } from "@/lib/stats";

export default function Dashboard({ data }: { data: DashboardData }) {
  const [teamId, setTeamId] = useState(data.teams[0]?.id ?? "");
  const summary = useMemo(() => summarizeTeam(data, teamId), [data, teamId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        {data.teams.length > 1 && (
          <select
            aria-label="Team"
            value={teamId}
            onChange={(event) => setTeamId(event.target.value)}
            className="rounded-md border border-neutral-300 bg-transparent p-2 text-sm dark:border-neutral-700"
          >
            {data.teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
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
