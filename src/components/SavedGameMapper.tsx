"use client";

import { useEffect, useState, type ReactNode } from "react";
import { secondaryButton } from "@/components/import/buttons";
import MappingStep, { type MappingPreview, type SaveState } from "@/components/import/MappingStep";
import { PanelLink } from "@/components/panels/links";
import { afterPendingWrites, describeSaveError, loadSavedGame, type SavedGame } from "@/lib/games";
import { getSupabase } from "@/lib/supabase/client";
import type { RosterPlayer } from "@/lib/veo";

const SAVED_NOTICE_MS = 3000;

type GameOption = { id: string; game_label: string; game_date: string; unassigned: number | null };
type Loaded = { id: string; game: SavedGame | null; error: string | null };

type SavedGameMapperProps = {
  /** In the order the arrows move through them. */
  games: GameOption[];
  roster: RosterPlayer[];
  /** Each player's saved minutes, by game. */
  seasonMinutes: Record<string, Record<string, number>>;
  /** Shown below the game's details. */
  intro: ReactNode;
  /** A change the dashboard can show ahead of it being saved. */
  onPreview: (gameId: string, preview: MappingPreview) => void;
  onSaved: (gameId: string, version: string) => void;
};

export default function SavedGameMapper({ games, roster, seasonMinutes, intro, onPreview, onSaved }: SavedGameMapperProps) {
  const [chosenId, setChosenId] = useState(() => (games.find((game) => (game.unassigned ?? 0) > 0) ?? games[0]).id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  const index = Math.max(0, games.findIndex((game) => game.id === chosenId));
  const currentId = games[index].id;
  const current = loaded?.id === currentId ? loaded : null;

  // Read fresh on each visit to a game, so going back shows what was last saved,
  // including a change still saving from just before moving on.
  useEffect(() => {
    let stale = false;
    afterPendingWrites()
      .then(() => loadSavedGame(getSupabase(), currentId))
      .then(
        (game) => {
          if (!stale) setLoaded({ id: currentId, game, error: null });
        },
        (cause) => {
          if (!stale) setLoaded({ id: currentId, game: null, error: describeSaveError(cause) });
        },
      );
    return () => {
      stale = true;
    };
  }, [currentId]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const timer = setTimeout(() => setSaveState("idle"), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [saveState]);

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[#0d1117] py-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={index === 0}
          onClick={() => setChosenId(games[index - 1].id)}
        >
          <span aria-hidden="true">← </span>Previous
        </button>
        <select
          aria-label="Saved game"
          value={currentId}
          onChange={(event) => setChosenId(event.target.value)}
          className="order-last min-w-0 basis-full rounded-md border border-neutral-300 bg-transparent p-2 text-sm sm:order-none sm:flex-1 sm:basis-0 dark:border-neutral-700"
        >
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.game_date} · {game.game_label}
              {game.unassigned === null ? "" : game.unassigned > 0 ? ` (${game.unassigned} unassigned)` : " ✓"}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={secondaryButton}
          disabled={index === games.length - 1}
          onClick={() => setChosenId(games[index + 1].id)}
        >
          Next<span aria-hidden="true"> →</span>
        </button>
        <div role="status" aria-live="polite" className="basis-full text-sm empty:hidden">
          {saveState === "saving" && <p className="text-neutral-400">Saving…</p>}
          {saveState === "saved" && (
            <p className="font-medium text-success">
              <span aria-hidden="true">✓ </span>Saved. Your dashboard is up to date.
            </p>
          )}
        </div>
      </div>

      {typeof saveState === "object" && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700 dark:text-red-400">
          <p>A change wasn&apos;t saved: {saveState.error}</p>
          <button type="button" className={secondaryButton} onClick={saveState.retry}>
            Try again
          </button>
        </div>
      )}

      {!current && <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading game…</p>}
      {current?.error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {current.error}
        </p>
      )}
      {current?.game && !current.game.payload && (
        <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          <p className="font-semibold">{games[index].game_label}</p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            This game was saved before jersey details were kept, so it can&apos;t be edited here
            yet.{" "}
            <PanelLink panel="import" className="font-medium text-emerald-700 underline dark:text-emerald-400">
              Import it once more
            </PanelLink>{" "}
            to replace it, and you&apos;ll be able to edit it here from then on.
          </p>
        </div>
      )}
      {current?.game?.payload && (
        <MappingStep
          key={currentId}
          teamId={current.game.teamId}
          roster={roster.filter((player) => player.team_id === current.game?.teamId)}
          payload={current.game.payload}
          game={{
            slug: current.game.payload.slug,
            title: current.game.label,
            date: current.game.date,
            opponent: current.game.opponent,
            hasReport: true,
          }}
          gameId={currentId}
          position={index + 1}
          total={games.length}
          seasonMinutes={seasonMinutes}
          saved={{ choices: current.game.choices, eventChoices: current.game.eventChoices }}
          intro={intro}
          onPreview={(preview) => onPreview(currentId, preview)}
          onSaveState={setSaveState}
          onSaved={(version) => onSaved(currentId, version)}
        />
      )}
    </div>
  );
}
