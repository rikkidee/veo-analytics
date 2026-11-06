"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PlayerModel } from "@/lib/dashboard";
import { RichText } from "./parts";
import { requestPlayerReport, type SavedReport } from "./reports";

export default function ScoutingReport({
  player,
  autoReport,
}: {
  player: PlayerModel;
  /** Set once the automatic run has written this player's report. */
  autoReport?: SavedReport;
}) {
  const router = useRouter();
  const [generated, setGenerated] = useState<SavedReport | null>(null);
  const [notes, setNotes] = useState(player.coachNotes ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { nickname, report, strengths, develop } = generated ?? autoReport ?? player;
  const hasReport = Boolean(nickname || report || strengths || develop);

  async function generate() {
    // Reports may be hand-written, and there's no way to get one back once replaced.
    if (hasReport && !window.confirm("Replace this player's current report? This can't be undone.")) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await requestPlayerReport(player.id, notes, false);
      if (result.report) {
        setGenerated(result.report);
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
      {hasReport && (
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
      )}
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
        <button type="button" className="generate-btn" disabled={generating} onClick={generate}>
          {generating ? "Generating…" : hasReport ? "Regenerate Analysis" : "Generate Analysis"}
        </button>
        <span role="status" className="muted">
          {generating && "This can take up to a minute."}
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
