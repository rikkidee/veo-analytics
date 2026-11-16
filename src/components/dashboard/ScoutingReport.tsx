"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlayerModel } from "@/lib/dashboard";
import { RichText } from "./parts";
import { useReadOnly } from "./read-only";
import { requestPlayerReport, type AutoReport, type SavedReport } from "./reports";

export default function ScoutingReport({
  player,
  autoReport,
  teamRunning,
}: {
  player: PlayerModel;
  /** Set once an automatic run or Regenerate All has written this player's report. */
  autoReport?: AutoReport;
  /** Reports are being written for the whole team, which this player may be part of. */
  teamRunning: boolean;
}) {
  const router = useRouter();
  const readOnly = useReadOnly();
  const [generated, setGenerated] = useState<SavedReport | null>(null);
  // A team-wide run writing this player's report replaces one regenerated here earlier.
  const [seenAutoReport, setSeenAutoReport] = useState(autoReport);
  if (autoReport !== seenAutoReport) {
    setSeenAutoReport(autoReport);
    setGenerated(null);
  }
  // The player as they were when regenerated, as the flags below are out of date until fresh data arrives.
  const [regeneratedFrom, setRegeneratedFrom] = useState<PlayerModel | null>(null);
  const [notes, setNotes] = useState(player.coachNotes ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { nickname, report, strengths, develop } = generated ?? autoReport ?? player;
  const hasReport = Boolean(nickname || report || strengths || develop);

  const outOfDate =
    hasReport &&
    !generating &&
    regeneratedFrom !== player &&
    autoReport?.basedOn !== player &&
    (player.statsChangedSinceReport || player.newGameSinceReport);
  const busy = generating || teamRunning;

  if (readOnly) {
    return hasReport ? (
      <div className="chart-container scouting">
        <ReportBody player={player} report={{ nickname, report, strengths, develop }} />
      </div>
    ) : null;
  }

  async function generate({ confirmFirst }: { confirmFirst: boolean }) {
    // Reports may be hand-written, and there's no way to get one back once replaced.
    if (confirmFirst && hasReport && !window.confirm("Replace this player's current report? This can't be undone.")) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await requestPlayerReport(player.id, notes, false);
      if (result.report) {
        setGenerated(result.report);
        setRegeneratedFrom(player);
        router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="chart-container scouting">
      {outOfDate && (
        <p className="report-stale">
          Stats updated since last analysis.{" "}
          <button type="button" disabled={busy} onClick={() => generate({ confirmFirst: false })}>
            Regenerate
          </button>
        </p>
      )}
      {hasReport && <ReportBody player={player} report={{ nickname, report, strengths, develop }} />}
      <label className="notes" style={hasReport ? undefined : { marginTop: 0 }}>
        Coach notes (optional)
        <textarea
          rows={2}
          maxLength={2000}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Add context for the AI (e.g. 'plays goalie half the time', 'just moved to forward')"
        />
      </label>
      <div className="generate-row">
        <button type="button" className="generate-btn" disabled={busy} onClick={() => generate({ confirmFirst: true })}>
          {generating ? "Generating…" : hasReport ? "Regenerate Analysis" : "Generate Analysis"}
        </button>
        <span role="status" className="muted">
          {generating ? "This can take up to a minute." : teamRunning && "Available once the team's reports are done."}
        </span>
      </div>
      {error && (
        <p role="alert" className="chart-error" style={{ margin: "12px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}

function ReportBody({ player, report: { nickname, report, strengths, develop } }: { player: PlayerModel; report: SavedReport }) {
  return (
    <>
      <h3>
        #{player.jersey} {player.name}
        {nickname ? ` — "${nickname}"` : ""}
      </h3>
      <div className="report">
        {report && <RichText html={report} />}
        {strengths && (
          <div style={{ marginTop: 12 }}>
            <strong style={{ color: "#3fb950" }}>Strengths:</strong> <RichText html={strengths} />
          </div>
        )}
        {develop && (
          <div style={{ marginTop: 8 }}>
            <strong style={{ color: "#f0883e" }}>Areas to Develop:</strong> <RichText html={develop} />
          </div>
        )}
      </div>
    </>
  );
}
