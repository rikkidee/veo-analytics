"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { Activity, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { CHART_JS_URL, ChartReady } from "@/components/dashboard/Chart";
import GameLogTab from "@/components/dashboard/GameLogTab";
import ImportScreen from "@/components/dashboard/ImportScreen";
import OnboardingGuide, { type OnboardingStage } from "@/components/dashboard/OnboardingGuide";
import LeaderboardTab from "@/components/dashboard/LeaderboardTab";
import PlayersTab from "@/components/dashboard/PlayersTab";
import { useAutoReports } from "@/components/dashboard/reports";
import TeamAnalysis from "@/components/dashboard/TeamAnalysis";
import TeamTab from "@/components/dashboard/TeamTab";
import type { MappingPreview } from "@/components/import/MappingStep";
import { useImportRun } from "@/components/import/ImportRunner";
import ImportWizard from "@/components/import/ImportWizard";
import { PanelLink, showPanel, useOpenPanel, type Panel } from "@/components/panels/links";
import MapPanel from "@/components/panels/MapPanel";
import PanelDrawer from "@/components/panels/PanelDrawer";
import SettingsPanel from "@/components/panels/SettingsPanel";
import RosterForm from "@/components/RosterForm";
import "@/components/dashboard/dashboard.css";
import { buildTeamModel, type TeamModel } from "@/lib/dashboard";
import { withPreviews, type DashboardData, type GamePreview } from "@/lib/stats";

const ONBOARDING_KEY = "veo-onboarding-v1";

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
  return (
    <>
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

function RosterPanel({
  data,
  teamId,
  onSaved,
  onCreated,
}: {
  data: DashboardData;
  teamId: string;
  onSaved: () => void;
  onCreated: (teamId: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const team = data.teams.find((other) => other.id === teamId);

  const intro = (
    <p className="mb-5 text-sm text-neutral-400">
      Add your team and the jersey each player usually wears. Your games come in next.
    </p>
  );

  if (!team) {
    return (
      <>
        {intro}
        <RosterForm key="first" onSaved={onCreated} />
      </>
    );
  }
  if (adding) {
    return (
      <>
        {intro}
        <RosterForm
          key="new"
          onSaved={(id) => {
            setAdding(false);
            onCreated(id);
          }}
        />
        <button type="button" className="mt-4 text-sm text-neutral-400 hover:underline" onClick={() => setAdding(false)}>
          Cancel
        </button>
      </>
    );
  }

  const gameCounts: Record<string, number> = {};
  for (const row of data.stats) gameCounts[row.player_id] = (gameCounts[row.player_id] ?? 0) + 1;

  return (
    <>
      <p className="mb-5 text-sm text-neutral-400">
        Changes show on the dashboard as soon as you save. A new jersey number applies to games imported from now on, and
        games already saved keep their assignments.
      </p>
      <RosterForm
        key={team.id}
        team={team}
        players={data.players.filter((player) => player.team_id === team.id)}
        gameCounts={gameCounts}
        onSaved={onSaved}
      />
      <button
        type="button"
        className="mt-8 border-t border-neutral-800 pt-4 text-sm font-medium text-emerald-400 hover:underline"
        onClick={() => setAdding(true)}
      >
        + Add another team
      </button>
    </>
  );
}

/** Stays up across every tab until no minutes are left on unassigned jerseys. */
function UnassignedBanner({ team }: { team: TeamModel }) {
  const games = team.games.filter((game) => Math.round(game.unassignedMinutes ?? 0) > 0);
  const minutes = Math.round(games.reduce((sum, game) => sum + (game.unassignedMinutes ?? 0), 0));
  if (minutes === 0) return null;
  return (
    <p role="status" className="unassigned-banner">
      <span aria-hidden="true">⚠️ </span>
      {minutes} {minutes === 1 ? "minute" : "minutes"} of player data across {games.length}{" "}
      {games.length === 1 ? "game is" : "games are"} unassigned — <PanelLink panel="map">Map Jerseys</PanelLink> to
      capture the full picture
    </p>
  );
}

export default function Dashboard({ data: saved, email }: { data: DashboardData; email: string | null }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [chosenTeamId, setChosenTeamId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("team");
  const [chartReady, setChartReady] = useState(false);
  const [chartFailed, setChartFailed] = useState(false);

  // Mapping shows on the dashboard right away, ahead of the save and refresh. Once
  // fresh data arrives, whatever had finished saving is in it.
  const [previews, setPreviews] = useState<Record<string, GamePreview>>({});
  const [seenData, setSeenData] = useState(saved);
  if (saved !== seenData) {
    setSeenData(saved);
    setPreviews((current) => Object.fromEntries(Object.entries(current).filter(([, preview]) => !preview.saved)));
  }
  const data = useMemo(() => withPreviews(saved, previews), [saved, previews]);
  const refresh = () => startRefresh(() => router.refresh());

  function handlePreview(gameId: string, preview: MappingPreview) {
    setPreviews((current) => ({ ...current, [gameId]: { ...preview, saved: false } }));
  }

  function handleMappingSaved(gameId: string, version: string) {
    setPreviews((current) =>
      current[gameId]?.version === version ? { ...current, [gameId]: { ...current[gameId], saved: true } } : current,
    );
    refresh();
  }

  // Stats first appear complete, so they wait for the import and then for its data.
  const { run, busy: importing, stop: stopImport } = useImportRun();
  const heldBy = run?.holdDashboard && importing && data.teams.some((team) => team.id === run.teamId) ? run : null;

  // Teams arrive newest first, and the newest can be empty, as adding a team doesn't
  // bring its games. Open on the newest one with games until someone chooses.
  const teamId =
    heldBy?.teamId ??
    data.teams.find((team) => team.id === chosenTeamId)?.id ??
    (data.teams.find((team) => data.games.some((game) => game.team_id === team.id)) ?? data.teams[0])?.id ??
    "";
  const currentTeam = data.teams.find((team) => team.id === teamId);
  const model = useMemo(() => buildTeamModel(data, teamId), [data, teamId]);

  // A brand new account has nothing to look at until it has a team.
  const opened = useOpenPanel();
  const panel: Panel | null = opened.panel;

  // A new account follows the guide until its jerseys are mapped. Only a browser that
  // showed the welcome screen gets the last step, so people already set up never see it.
  const stage: OnboardingStage | null = !currentTeam
    ? 1
    : model.games.length === 0
      ? 2
      : model.games.some((game) => (game.unassignedJerseys ?? 0) > 0)
        ? 3
        : null;
  const [onboarding, setOnboarding] = useState(() => {
    try {
      return window.localStorage.getItem(ONBOARDING_KEY) === "1";
    } catch {
      return false;
    }
  });
  if ((stage === 1 || stage === 2) && !onboarding) setOnboarding(true);
  if (stage === null && onboarding) setOnboarding(false);
  useEffect(() => {
    try {
      if (onboarding) window.localStorage.setItem(ONBOARDING_KEY, "1");
      else window.localStorage.removeItem(ONBOARDING_KEY);
    } catch {
      // Storage blocked: the guide still shows while there's nothing to look at.
    }
  }, [onboarding]);
  const showLastStep = onboarding && stage === 3 && !heldBy;
  const guideTitle = data.games.length === 0 ? "Welcome to Veo Analytics" : `Finish setting up ${currentTeam?.name ?? "your team"}`;

  // Mounted on first use and then kept, so a half-edited roster or the game being
  // mapped is still there on coming back. Activity stops their effects while hidden.
  const [visited, setVisited] = useState<Panel[]>([]);
  if (panel && !visited.includes(panel)) setVisited([...visited, panel]);
  const keptMounted = (name: Panel) => (panel === name ? "visible" : "hidden");

  // A new team moves on to importing as soon as the dashboard has it.
  const awaitingTeam = useRef<string | null>(null);
  useEffect(() => {
    if (awaitingTeam.current && saved.teams.some((team) => team.id === awaitingTeam.current)) {
      awaitingTeam.current = null;
      showPanel("import");
    }
  }, [saved]);

  function handleTeamCreated(id: string) {
    setChosenTeamId(id);
    awaitingTeam.current = id;
    refresh();
  }

  // Next keeps visited pages mounted but hidden, and this cleanup runs when hidden,
  // so the dashboard's full-width page rules don't follow the user to other pages.
  useLayoutEffect(() => {
    document.body.dataset.dashboard = "";
    return () => {
      delete document.body.dataset.dashboard;
    };
  }, []);

  const beside = panel && !opened.hidden ? (panel === "map" ? "wide" : "") : undefined;

  return (
    <>
      <div className="veo-dash" data-beside-panel={beside}>
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
          <h1>{currentTeam?.name ?? "Welcome to Veo Analytics"}</h1>
          {data.teams.length > 1 && !heldBy && (
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

        {heldBy ? (
          <div className="container">
            <ImportScreen run={heldBy} onStop={stopImport} />
          </div>
        ) : stage === 1 || stage === 2 ? (
          <div className="container">
            <OnboardingGuide stage={stage} title={guideTitle} />
          </div>
        ) : (
          <>
            {showLastStep ? (
              <OnboardingGuide stage={3} title="Getting started" compact onHide={() => setOnboarding(false)} />
            ) : (
              <UnassignedBanner team={model} />
            )}
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
      <PanelDrawer panel={panel} hidden={opened.hidden} canClose>
        {panel === "import" &&
          (currentTeam ? (
            <ImportWizard
              key={teamId}
              team={currentTeam}
              roster={data.players
                .filter((player) => player.team_id === teamId)
                .map(({ id, team_id, name, default_jersey }) => ({ id, team_id, name, default_jersey }))}
              importedUrls={data.games.filter((game) => game.team_id === teamId).map((game) => game.veo_url)}
              onStarted={() => showPanel(null)}
              onClose={() => showPanel(null)}
            />
          ) : (
            <NeedsTeam />
          ))}
        {visited.includes("map") && (
          <Activity mode={keptMounted("map")}>
            {currentTeam ? (
              <MapPanel key={teamId} data={data} teamId={teamId} onPreview={handlePreview} onSaved={handleMappingSaved} />
            ) : (
              <NeedsTeam />
            )}
          </Activity>
        )}
        {visited.includes("roster") && (
          <Activity mode={keptMounted("roster")}>
            <RosterPanel data={saved} teamId={teamId} onSaved={refresh} onCreated={handleTeamCreated} />
          </Activity>
        )}
        {panel === "settings" && <SettingsPanel email={email} />}
      </PanelDrawer>
    </>
  );
}

function NeedsTeam() {
  return (
    <p className="text-sm">
      Add your team first.{" "}
      <PanelLink panel="roster" className="font-medium text-emerald-400 underline">
        Set up your roster
      </PanelLink>
    </p>
  );
}
