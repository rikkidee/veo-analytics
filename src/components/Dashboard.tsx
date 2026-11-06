"use client";

import Link from "next/link";
import Script from "next/script";
import { useLayoutEffect, useMemo, useState } from "react";
import { CHART_JS_URL, ChartReady } from "@/components/dashboard/Chart";
import GameLogTab from "@/components/dashboard/GameLogTab";
import LeaderboardTab from "@/components/dashboard/LeaderboardTab";
import PlayersTab from "@/components/dashboard/PlayersTab";
import { useAutoReports } from "@/components/dashboard/reports";
import TeamAnalysis from "@/components/dashboard/TeamAnalysis";
import TeamTab from "@/components/dashboard/TeamTab";
import "@/components/dashboard/dashboard.css";
import { buildTeamModel, type TeamModel } from "@/lib/dashboard";
import type { DashboardData } from "@/lib/stats";

const TABS = [
  ["team", "Team Overview"],
  ["players", "Player Profiles"],
  ["leaderboard", "Leaderboards"],
  ["gamelog", "Game Log"],
  ["analysis", "Analysis"],
] as const;
type Tab = (typeof TABS)[number][0];

// All tabs stay mounted and only hide, so each keeps its selections when switching.
function TeamContent({ team, tab }: { team: TeamModel; tab: Tab }) {
  const panel = (name: Tab) => (tab === name ? undefined : "hidden");
  const auto = useAutoReports(team);
  const gamesToMap = team.games.filter((game) => (game.unassignedJerseys ?? 0) > 0).length;
  return (
    <>
      {gamesToMap > 0 && (
        <div className="mapping-banner">
          <p>
            We auto-matched {team.players.length} of {team.rosterSize} players across {team.games.length}{" "}
            {team.games.length === 1 ? "game" : "games"}. Some player stats may be incomplete.
          </p>
          <Link href="/map-jerseys">Complete jersey mapping for full accuracy →</Link>
        </div>
      )}
      {auto.status && (
        <p role="status" className="generate-status">
          {auto.status}
        </p>
      )}
      {auto.problem && (
        <p role="alert" className="chart-error">
          {auto.problem}
        </p>
      )}
      <div className={panel("team")}><TeamTab team={team} /></div>
      <div className={panel("players")}><PlayersTab team={team} reports={auto.reports} /></div>
      <div className={panel("leaderboard")}><LeaderboardTab team={team} /></div>
      <div className={panel("gamelog")}><GameLogTab team={team} /></div>
      <div className={panel("analysis")}>
        <TeamAnalysis team={team} autoAnalysis={auto.teamAnalysis} autoRunning={auto.generatingTeam} />
      </div>
    </>
  );
}

export default function Dashboard({ data }: { data: DashboardData }) {
  const [chosenTeamId, setChosenTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("team");
  const [chartReady, setChartReady] = useState(false);
  const [chartFailed, setChartFailed] = useState(false);

  // Teams arrive newest first, and the newest can be empty, as saving a roster
  // always adds a team. Open on the newest one with games until someone chooses.
  const teamId =
    chosenTeamId ??
    (data.teams.find((team) => data.games.some((game) => game.team_id === team.id)) ?? data.teams[0])
      ?.id ??
    "";
  const currentTeam = data.teams.find((team) => team.id === teamId);
  const model = useMemo(() => buildTeamModel(data, teamId), [data, teamId]);

  // Next keeps visited pages mounted but hidden, and this cleanup runs when hidden,
  // so the dashboard's full-width page rules don't follow the user to other pages.
  useLayoutEffect(() => {
    document.body.dataset.dashboard = "";
    return () => {
      delete document.body.dataset.dashboard;
    };
  }, []);

  return (
    <div className="veo-dash">
      <Script
        src={CHART_JS_URL}
        onReady={() => setChartReady(true)}
        onError={() => setChartFailed(true)}
      />
      <div className="header">
        {currentTeam?.logo_url && (
          // Logos are saved by users and can be from anywhere, so next/image can't be configured for them.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={currentTeam.logo_url} alt="" />
        )}
        <h1>{currentTeam?.name}</h1>
        {data.teams.length > 1 && (
          <select
            aria-label="Team"
            value={teamId}
            onChange={(event) => setChosenTeamId(event.target.value)}
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

      {model.games.length === 0 ? (
        <div className="container">
          <p style={{ marginTop: 32 }}>
            No games yet. <Link href="/onboarding/games">Import your first games</Link>
          </p>
        </div>
      ) : (
        <>
          <div className="nav">
            {TABS.map(([name, label]) => (
              <button
                key={name}
                type="button"
                className={tab === name ? "active" : undefined}
                aria-pressed={tab === name}
                onClick={() => setTab(name)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="container">
            {chartFailed && (
              <p role="alert" className="chart-error">
                The charts couldn&apos;t load. Check your connection and refresh the page.
              </p>
            )}
            <ChartReady value={chartReady}>
              <TeamContent key={teamId} team={model} tab={tab} />
            </ChartReady>
          </div>
        </>
      )}
    </div>
  );
}
