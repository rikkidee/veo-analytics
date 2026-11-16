"use client";

import { useRouter } from "next/navigation";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useImportRun } from "@/components/import/ImportRunner";
import type { PlayerModel, TeamModel } from "@/lib/dashboard";

export type SavedReport = Pick<PlayerModel, "nickname" | "report" | "strengths" | "develop">;

type Failure = { status: number; error: string };

async function post(url: string, body: object): Promise<({ ok: true; result: Record<string, string | null> }) | ({ ok: false } & Failure)> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    return response.ok
      ? { ok: true, result }
      : { ok: false, status: response.status, error: result?.error ?? "That couldn't be generated. Try again." };
  } catch {
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

export async function requestPlayerReport(
  playerId: string,
  coachNotes: string,
  onlyIfNeeded: boolean,
): Promise<{ report: SavedReport; error?: undefined; status?: undefined } | ({ report?: undefined } & Failure)> {
  const response = await post(`/api/players/${playerId}/report`, { coachNotes, onlyIfNeeded });
  if (!response.ok) return { status: response.status, error: response.error };
  const { nickname, scouting_report, strengths, areas_to_develop } = response.result;
  return { report: { nickname, report: scouting_report, strengths, develop: areas_to_develop } };
}

export async function requestTeamAnalysis(
  teamId: string,
  onlyIfMissing: boolean,
  /** Left out, the context last saved for this team is used. */
  coachContext?: string,
): Promise<
  | { analysis: string | null; contextSaved: boolean; error?: undefined; status?: undefined }
  | ({ analysis?: undefined } & Failure)
> {
  const response = await post(`/api/teams/${teamId}/analysis`, { onlyIfMissing, coachContext });
  if (!response.ok) return { status: response.status, error: response.error };
  return { analysis: response.result.team_analysis, contextSaved: response.result.context_saved !== "false" };
}

/** No report yet, or one written before the latest game came in. */
const needsReport = (player: PlayerModel) =>
  player.newGameSinceReport || !(player.nickname || player.report || player.strengths || player.develop);

// A 502 means just this one failed. Anything else, such as a missing API key or
// being rate limited, would fail the same way for every player and might cost money.
const ONLY_THIS_ONE_FAILED = 502;
// These stop the team analysis as well. A missing column doesn't, as the team's is a different one.
const AFFECTS_EVERYTHING = new Set([0, 401, 429, 503]);

/** A report written this visit, with the player as they were when it was written. */
export type AutoReport = SavedReport & { basedOn: PlayerModel };

/**
 * Writes whatever's missing or outdated by a new game, one at a time, with each
 * player's saved coach notes. It runs on opening the dashboard and again after every
 * import that brings in a game. Everything is saved as it goes, so leaving the page
 * loses nothing and the next run picks up the rest.
 *
 * `regenerateAll` replaces every player's report, whether or not it's outdated.
 */
export function useAutoReports(team: TeamModel) {
  const router = useRouter();
  // Reports written mid-import would judge players on a game or two, so a run waits
  // until every game is in, and one already going stops and starts over afterwards.
  const { busy: importing } = useImportRun();
  const [reports, setReports] = useState<Record<string, AutoReport>>({});
  const [teamAnalysis, setTeamAnalysis] = useState<string | null>(null);
  const [progress, setProgress] = useState(() => {
    const missing = team.players.filter(needsReport).length;
    return !importing && team.hasMinutes && missing > 0
      ? { complete: team.players.length - missing, total: team.players.length }
      : null;
  });
  const [generatingTeam, setGeneratingTeam] = useState(false);
  const [running, setRunning] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The games the last automatic run was for. An imported game changes them, which
  // starts another run. It also keeps Next hiding and showing this page to one run.
  const ranFor = useRef<string | null>(null);
  // Bumped to stop the run in progress. Requests already sent still save.
  const runId = useRef(0);
  const isRunning = useRef(false);
  const gamesKey = team.games.map((game) => game.id).join(",");

  async function runPass(targets: PlayerModel[], { force }: { force: boolean }) {
    const id = ++runId.current;
    isRunning.current = true;
    setRunning(true);
    setProblem(null);

    const total = force ? targets.length : team.players.length;
    let complete = total - targets.length;
    let failed = 0;
    let stoppedBy: number | null = null;
    let wroteSomething = false;
    const stopped = () => runId.current !== id;
    if (targets.length > 0) setProgress({ complete, total });

    for (const player of targets) {
      const result = await requestPlayerReport(player.id, player.coachNotes ?? "", !force);
      if (stopped()) return;
      if (result.report) {
        const report = { ...result.report, basedOn: player };
        setReports((current) => ({ ...current, [player.id]: report }));
        complete += 1;
        wroteSomething = true;
        setProgress({ complete, total });
      } else if (result.status === ONLY_THIS_ONE_FAILED) {
        failed += 1;
      } else {
        stoppedBy = result.status;
        setProblem(result.error);
        break;
      }
    }
    setProgress(null);

    // Regenerate All is for the players. The team's analysis has its own button.
    if (!force && !team.teamAnalysis && (stoppedBy === null || !AFFECTS_EVERYTHING.has(stoppedBy))) {
      setGeneratingTeam(true);
      const result = await requestTeamAnalysis(team.id, true);
      if (stopped()) return;
      setGeneratingTeam(false);
      if (result.error === undefined) {
        setTeamAnalysis(result.analysis);
        wroteSomething = true;
      } else {
        setProblem((current) => current ?? result.error);
      }
    }

    if (failed > 0) {
      const whose = `${failed} ${failed === 1 ? "player's report" : "players' reports"}`;
      setProblem(
        (current) =>
          current ??
          (force
            ? `The AI couldn't write ${whose}. Regenerate them from their profiles, or try Regenerate All again.`
            : `The AI couldn't write ${whose}. They'll be tried again next time this page opens or a game comes in.`),
      );
    }
    isRunning.current = false;
    setRunning(false);
    if (wroteSomething) router.refresh();
  }

  function stop() {
    runId.current += 1;
    isRunning.current = false;
    // So the run starts over once the import is done, even if it brought no new games.
    ranFor.current = null;
    setRunning(false);
    setProgress(null);
    setGeneratingTeam(false);
  }

  const onDataChange = useEffectEvent(() => {
    if (importing) {
      if (isRunning.current) stop();
      return;
    }
    if (isRunning.current || ranFor.current === gamesKey || !team.hasMinutes) return;
    ranFor.current = gamesKey;
    const missing = team.players.filter(needsReport);
    if (missing.length > 0 || !team.teamAnalysis) void runPass(missing, { force: false });
  });

  useEffect(() => {
    const timer = setTimeout(() => onDataChange());
    return () => clearTimeout(timer);
  }, [importing, gamesKey]);

  function regenerateAll() {
    if (isRunning.current || importing || !team.hasMinutes || team.players.length === 0) return;
    const count = team.players.length;
    // Reports may be hand-written, and there's no way to get one back once replaced.
    const replace = window.confirm(
      `Regenerate the analysis for all ${count} ${count === 1 ? "player" : "players"}? This replaces every current report and can't be undone.`,
    );
    if (replace) void runPass(team.players, { force: true });
  }

  return {
    reports,
    teamAnalysis,
    generatingTeam,
    problem,
    /** A run is writing reports, so per-player regenerating waits for it. */
    running,
    regenerateAll,
    /** Why Regenerate All can't run right now, if it can't. */
    regenerateAllBlocked: !team.hasMinutes
      ? "Reports use per 60 stats, and this team's games have no minutes saved."
      : importing
        ? "Available once the import finishes."
        : null,
    status: progress
      ? `Generating analysis... ${progress.complete}/${progress.total} players complete`
      : generatingTeam
        ? "Generating team analysis..."
        : null,
  };
}
