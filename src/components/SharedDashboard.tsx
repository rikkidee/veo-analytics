"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useEffect, useLayoutEffect, useMemo, useState, useTransition } from "react";
import { CHART_JS_URL, ChartReady } from "@/components/dashboard/Chart";
import GameLogTab from "@/components/dashboard/GameLogTab";
import LeaderboardTab from "@/components/dashboard/LeaderboardTab";
import PlayersTab from "@/components/dashboard/PlayersTab";
import { ReadOnly } from "@/components/dashboard/read-only";
import { TABS, type Tab } from "@/components/dashboard/tabs";
import TeamAnalysis from "@/components/dashboard/TeamAnalysis";
import TeamTab from "@/components/dashboard/TeamTab";
import "@/components/dashboard/dashboard.css";
import { buildTeamModel } from "@/lib/dashboard";
import type { DashboardData } from "@/lib/stats";

const REFRESH_EVERY_MS = 5 * 60_000;
const NO_REPORTS = {};
const nothing = () => {};

/** A team's dashboard on its public link: the same tabs, with nothing to change. */
export default function SharedDashboard({ data, teamId }: { data: DashboardData; teamId: string }) {
  const router = useRouter();
  const [, startRefresh] = useTransition();
  const [tab, setTab] = useState<Tab>("team");
  const [chartReady, setChartReady] = useState(false);
  const [chartFailed, setChartFailed] = useState(false);
  const team = data.teams[0];
  const model = useMemo(() => buildTeamModel(data, teamId), [data, teamId]);

  // Stays current for a coach who leaves it open: new games show on coming back to the
  // tab, and every few minutes while it's in view.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") startRefresh(() => router.refresh());
    };
    const timer = setInterval(refresh, REFRESH_EVERY_MS);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router]);

  // The same full-width page rules as the signed-in dashboard.
  useLayoutEffect(() => {
    document.body.dataset.dashboard = "";
    return () => {
      delete document.body.dataset.dashboard;
    };
  }, []);

  const panel = (name: Tab) => (tab === name ? undefined : "hidden");

  return (
    <ReadOnly value={true}>
      <div className="veo-dash">
        <Script src={CHART_JS_URL} onReady={() => setChartReady(true)} onError={() => setChartFailed(true)} />
        <div className="header">
          {team.logo_url && (
            // Logos are saved by users and can be from anywhere, so next/image can't be configured for them.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logo_url} alt="" />
          )}
          <h1>{team.name}</h1>
          <span className="shared-badge">View only</span>
        </div>

        {model.games.length === 0 ? (
          <div className="container">
            <p className="muted">No games have been added for this team yet. Check back after the next match.</p>
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
                <div className={panel("team")}><TeamTab team={model} /></div>
                <div className={panel("players")}>
                  <PlayersTab
                    team={model}
                    reports={NO_REPORTS}
                    reportsRunning={false}
                    onRegenerateAll={nothing}
                    regenerateAllBlocked={null}
                  />
                </div>
                <div className={panel("leaderboard")}><LeaderboardTab team={model} /></div>
                <div className={panel("gamelog")}><GameLogTab team={model} /></div>
                <div className={panel("analysis")}>
                  <TeamAnalysis team={model} autoAnalysis={null} autoRunning={false} />
                </div>
              </ChartReady>
            </div>
          </>
        )}
      </div>
    </ReadOnly>
  );
}
