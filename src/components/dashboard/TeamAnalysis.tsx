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
  const [context, setContext] = useState(team.coachContext ?? "");
  const [contextNotSaved, setContextNotSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analysis = generated ?? autoAnalysis ?? team.teamAnalysis;
  const busy = generating || autoRunning;

  async function generate() {
    if (analysis && !window.confirm("Replace the current team analysis? This can't be undone.")) return;
    setGenerating(true);
    setError(null);
    const result = await requestTeamAnalysis(team.id, false, context);
    setGenerating(false);
    if (result.error === undefined) {
      setGenerated(result.analysis);
      setContextNotSaved(!result.contextSaved);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <>
      <div className="chart-container scouting" style={{ marginTop: 32 }}>
        <label className="notes" style={{ marginTop: 0 }}>
          Coach context (optional)
          <textarea
            rows={3}
            maxLength={2000}
            value={context}
            onChange={(event) => setContext(event.target.value)}
            placeholder="Add context for the AI (e.g. 'two starters missed October', 'we moved to a 4-3-3 in game 5', 'game 1 tracking looks off')"
          />
        </label>
        <div className="generate-row">
          <button type="button" className="generate-btn" disabled={busy} onClick={generate}>
            {busy ? "Generating…" : analysis ? "Regenerate with context" : "Generate Analysis"}
          </button>
          <span role="status" className="muted">
            {busy ? "This can take up to a minute." : analysis ? "Written by AI from this team's saved stats." : ""}
          </span>
        </div>
        {contextNotSaved && (
          <p role="status" className="chart-error" style={{ margin: "12px 0 0" }}>
            The analysis used your context, but it can&apos;t be remembered yet. Run supabase/add-team-coach-context.sql
            in the Supabase SQL Editor to keep it.
          </p>
        )}
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
