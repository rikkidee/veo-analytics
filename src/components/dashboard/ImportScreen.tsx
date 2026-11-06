"use client";

import type { ImportRun } from "@/components/import/ImportRunner";

/** Stands in for the stats during an import, so they first appear complete. */
export default function ImportScreen({ run, onStop }: { run: ImportRun; onStop: () => void }) {
  const total = run.games.length;
  const complete = run.saved + run.failures.length;

  return (
    <div className="import-screen">
      <h2 role="status">
        Importing games... {complete} of {total} complete
      </h2>
      <div
        role="progressbar"
        aria-label="Import progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={complete}
        className="import-track"
      >
        <div className="import-fill" style={{ width: `${total ? (complete / total) * 100 : 0}%` }} />
      </div>
      <p className="muted">
        {run.active
          ? run.stopping
            ? "Stopping after this game. Your dashboard will open with what's been saved."
            : "Your dashboard opens when they're all in. Each game can take up to a minute. Keep this tab open, and the small Veo window too."
          : "All done. Opening your dashboard…"}
      </p>
      {run.failures.length > 0 && (
        <p className="chart-error">
          {run.failures.length} {run.failures.length === 1 ? "game" : "games"} couldn&apos;t be imported so far. You&apos;ll
          see which, and can try again, once the rest are in.
        </p>
      )}
      {run.active && !run.stopping && (
        <button type="button" className="toggle-btn" onClick={onStop}>
          Stop importing
        </button>
      )}
    </div>
  );
}
