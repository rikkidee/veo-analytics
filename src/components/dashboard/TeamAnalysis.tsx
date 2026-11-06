"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TeamModel } from "@/lib/dashboard";
import { RichText } from "./parts";
import { requestTeamAnalysis } from "./reports";

export default function TeamAnalysis({
  team,
  autoAnalysis,
  autoRunning,
}: {
  team: TeamModel;
  /** Set once the automatic run has written this team's analysis. */
  autoAnalysis: string | null;
  autoRunning: boolean;
}) {
  const router = useRouter();
  const [generated, setGenerated] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = generated ?? autoAnalysis ?? team.teamAnalysis;
  const busy = generating || autoRunning;

  async function generate() {
    if (analysis && !window.confirm("Replace the current team analysis? This can't be undone.")) return;
    setGenerating(true);
    setError(null);
    const result = await requestTeamAnalysis(team.id, false);
    setGenerating(false);
    if (result.error === undefined) {
      setGenerated(result.analysis);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <div className="team-analysis-actions">
        <button type="button" className="generate-btn" disabled={busy} onClick={generate}>
          {busy ? "Generating…" : analysis ? "Regenerate Analysis" : "Generate Analysis"}
        </button>
        <span role="status" className="muted">
          {busy ? "This can take up to a minute." : analysis ? "Written by AI from this team's saved stats." : ""}
        </span>
      </div>
      {error && (
        <p role="alert" className="chart-error" style={{ margin: "12px 0 0" }}>
          {error}
        </p>
      )}
      {analysis && <RichText html={analysis} />}
      {/* Written by hand, so it's kept apart and never replaced by a generated one. */}
      {team.analysis && <RichText html={team.analysis} />}
    </>
  );
}
