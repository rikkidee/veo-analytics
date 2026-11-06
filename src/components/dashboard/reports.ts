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
  onlyIfMissing: boolean,
): Promise<{ report: SavedReport; error?: undefined; status?: undefined } | ({ report?: undefined } & Failure)> {
  const response = await post(`/api/players/${playerId}/report`, { coachNotes, onlyIfMissing });
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

const hasReport = (player: PlayerModel) =>
  Boolean(player.nickname || player.report || player.strengths || player.develop);

// A 502 means just this one failed. Anything else, such as a missing API key or
// being rate limited, would fail the same way for every player and might cost money.
const ONLY_THIS_ONE_FAILED = 502;
// These stop the team analysis as well. A missing column doesn't, as the team's is a different one.
const AFFECTS_EVERYTHING = new Set([0, 401, 429, 503]);

/**
 * Writes whatever's missing, one at a time, once per visit. Everything is saved as
 * it goes, so leaving the page loses nothing and the next visit picks up the rest.
 */
export function useAutoReports(team: TeamModel) {
  const router = useRouter();
  // Reports written mid-import would judge players on a game or two, and they don't
  // regenerate by themselves, so this waits until every game is in.
  const { busy: importing } = useImportRun();
  const [reports, setReports] = useState<Record<string, SavedReport>>({});
  const [teamAnalysis, setTeamAnalysis] = useState<string | null>(null);
  const [progress, setProgress] = useState(() => {
    const missing = team.players.filter((player) => !hasReport(player)).length;
    return team.hasMinutes && missing > 0
      ? { complete: team.players.length - missing, total: team.players.length }
      : null;
  });
  const [generatingTeam, setGeneratingTeam] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // Effects re-run when Next hides and shows this page, and this keeps it to one run.
  const started = useRef(false);

  const start = useEffectEvent(async () => {
    if (started.current || importing || !team.hasMinutes) return;
    started.current = true;

    const missing = team.players.filter((player) => !hasReport(player));
    const total = team.players.length;
    let complete = total - missing.length;
    let failed = 0;
    let stoppedBy: number | null = null;
    let wroteSomething = false;

    for (const player of missing) {
      const result = await requestPlayerReport(player.id, player.coachNotes ?? "", true);
      if (result.report) {
        const { report } = result;
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

    if (!team.teamAnalysis && (stoppedBy === null || !AFFECTS_EVERYTHING.has(stoppedBy))) {
      setGeneratingTeam(true);
      const result = await requestTeamAnalysis(team.id, true);
      setGeneratingTeam(false);
      if (result.error === undefined) {
        setTeamAnalysis(result.analysis);
        wroteSomething = true;
      } else {
        setProblem((current) => current ?? result.error);
      }
    }

    if (failed > 0) {
      setProblem(
        (current) =>
          current ??
          `The AI couldn't write ${failed} ${failed === 1 ? "player's report" : "players' reports"}. They'll be tried again next time this page opens.`,
      );
    }
    if (wroteSomething) router.refresh();
  });

  useEffect(() => {
    const timer = setTimeout(() => void start());
    return () => clearTimeout(timer);
  }, [importing]);

  return {
    reports,
    teamAnalysis,
    generatingTeam,
    problem,
    status: progress
      ? `Generating analysis... ${progress.complete}/${progress.total} players complete`
      : generatingTeam
        ? "Generating team analysis..."
        : null,
  };
}
