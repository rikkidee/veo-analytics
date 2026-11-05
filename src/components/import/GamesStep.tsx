"use client";

import { useEffect, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/import/buttons";
import {
  cancelImport,
  startImport,
  subscribeToImportEvents,
  type GameResult,
} from "@/lib/veo-extension";
import type { VeoGame } from "@/lib/veo";

// Longer than the extension allows for one report, so this only fires if it died.
const STALL_TIMEOUT_MS = 150_000;

type GamesStepProps = {
  games: VeoGame[];
  selected: string[];
  results: Record<string, GameResult>;
  isImported: (slug: string) => boolean;
  loading: boolean;
  loadError: string | null;
  onReload: () => void;
  onSelectedChange: (selected: string[]) => void;
  onResult: (slug: string, result: GameResult) => void;
  pendingMappings: number;
  onBack: () => void;
  onContinue: () => void;
};

export default function GamesStep({
  games,
  selected,
  results,
  isImported,
  loading,
  loadError,
  onReload,
  onSelectedChange,
  onResult,
  pendingMappings,
  onBack,
  onContinue,
}: GamesStepProps) {
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null);
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const lastActivity = useRef(0);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const importing = progress !== null;

  useEffect(
    () =>
      subscribeToImportEvents((event) => {
        lastActivity.current = Date.now();
        if (event.type === "IMPORT_PROGRESS") {
          setCurrentSlug(event.slug);
          setProgress({ completed: event.completed, total: event.total });
        } else if (event.type === "IMPORT_GAME_RESULT") {
          onResultRef.current(event.slug, event.result);
          setProgress((current) =>
            current ? { ...current, completed: current.completed + 1 } : current,
          );
        } else {
          setProgress(null);
          setCurrentSlug(null);
          if (event.error) setImportError(event.error);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(() => {
      if (Date.now() - lastActivity.current < STALL_TIMEOUT_MS) return;
      setProgress(null);
      setCurrentSlug(null);
      setImportError(
        "The import stopped responding. Games already read are kept below; select the rest and try again.",
      );
      void cancelImport().catch(() => {});
    }, 5_000);
    return () => clearInterval(timer);
  }, [importing]);

  async function beginImport() {
    setImportError(null);
    lastActivity.current = Date.now();
    setProgress({ completed: 0, total: selected.length });
    try {
      const response = await startImport(selected);
      if (!response.ok) {
        setProgress(null);
        setImportError(response.error ?? "The import could not start.");
      }
    } catch (cause) {
      setProgress(null);
      setImportError((cause as Error).message);
    }
  }

  function toggle(slug: string) {
    onSelectedChange(
      selected.includes(slug)
        ? selected.filter((other) => other !== slug)
        : [...selected, slug],
    );
  }

  const eligible = games.filter((game) => game.hasReport !== false);
  const allSelected = eligible.length > 0 && selected.length === eligible.length;
  const percent = progress ? Math.round((progress.completed / progress.total) * 100) : 0;
  const failed = Object.values(results).filter((result) => !result.ok).length;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Import games</h2>
        <button
          type="button"
          className="text-sm font-medium text-emerald-700 hover:underline disabled:opacity-50 dark:text-emerald-400"
          disabled={loading || importing}
          onClick={onReload}
        >
          Read the list again
        </button>
      </div>

      {loading && (
        <p role="status" className="text-sm text-neutral-600 dark:text-neutral-400">
          Reading your recordings from Veo. A small Veo window will open and close by itself.
        </p>
      )}
      {loadError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {loadError}
        </p>
      )}

      {games.length > 0 && (
        <>
          <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
            {games.map((game) => {
              const noReport = game.hasReport === false;
              const result = results[game.slug];
              return (
                <li key={game.slug} className={noReport ? "opacity-50" : undefined}>
                  <label
                    className={`flex items-start gap-3 p-3 text-sm ${noReport ? "cursor-not-allowed" : "cursor-pointer"}`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 accent-emerald-700"
                      disabled={noReport || importing}
                      checked={selected.includes(game.slug)}
                      onChange={() => toggle(game.slug)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{game.title}</span>
                      <span className="block text-neutral-600 dark:text-neutral-400">
                        {game.date ?? "Date not found"}
                        {game.opponent ? ` · vs ${game.opponent}` : ""}
                        {noReport ? " · No match report" : ""}
                        {isImported(game.slug) ? " · Already imported; importing again replaces it" : ""}
                      </span>
                      {result && !result.ok && (
                        <span className="block text-red-700 dark:text-red-400">{result.error}</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-neutral-600 dark:text-neutral-400">
                      {currentSlug === game.slug && "Reading…"}
                      {currentSlug !== game.slug && result?.ok && "✓ Read"}
                      {currentSlug !== game.slug && result && !result.ok && "Failed"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          {progress && (
            <div className="flex flex-col gap-1">
              <div
                role="progressbar"
                aria-label="Import progress"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.completed}
                className="h-2 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
              >
                <div
                  className="h-full rounded-full bg-emerald-700 transition-[width]"
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {progress.completed} of {progress.total} games read. Leave the small Veo window
                open until this finishes.
              </p>
            </div>
          )}
        </>
      )}

      {importError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {importError}
        </p>
      )}
      {!importing && failed > 0 && (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          {failed} {failed === 1 ? "game" : "games"} couldn&apos;t be read. You can select them and
          try again, or carry on without them.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="button" className={secondaryButton} disabled={importing} onClick={onBack}>
          Back
        </button>
        {importing ? (
          <button
            type="button"
            className={secondaryButton}
            onClick={() => void cancelImport().catch(() => {})}
          >
            Stop after this game
          </button>
        ) : (
          <button
            type="button"
            className={pendingMappings > 0 ? secondaryButton : primaryButton}
            disabled={selected.length === 0}
            onClick={beginImport}
          >
            {allSelected ? "Import All" : "Import Selected"} ({selected.length})
          </button>
        )}
        {pendingMappings > 0 && !importing && (
          <button type="button" className={primaryButton} onClick={onContinue}>
            Map jerseys for {pendingMappings} {pendingMappings === 1 ? "game" : "games"}
          </button>
        )}
      </div>
    </section>
  );
}
