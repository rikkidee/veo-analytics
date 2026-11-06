"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { secondaryButton } from "@/components/import/buttons";
import MappingStep from "@/components/import/MappingStep";
import { describeSaveError, loadSavedGame, type SavedGame } from "@/lib/games";
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
};

export default function SavedGameMapper({ games, roster, seasonMinutes }: SavedGameMapperProps) {
  const router = useRouter();
  const [chosenId, setChosenId] = useState(() => (games.find((game) => (game.unassigned ?? 0) > 0) ?? games[0]).id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const hasEdits = useRef(false);

  const index = Math.max(0, games.findIndex((game) => game.id === chosenId));
  const currentId = games[index].id;
  const current = loaded?.id === currentId ? loaded : null;

  // Read fresh on each visit to a game, so going back shows what was last saved.
  useEffect(() => {
    let stale = false;
    loadSavedGame(getSupabase(), currentId).then(
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
    if (!savedAt) return;
    const timer = setTimeout(() => setSavedAt(0), SAVED_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [savedAt]);

  function goTo(id: string) {
    if (hasEdits.current && !window.confirm("Discard your unsaved changes to this game?")) return;
    hasEdits.current = false;
    setChosenId(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-[var(--background)] py-2">
        <button
          type="button"
          className={secondaryButton}
          disabled={index === 0}
          onClick={() => goTo(games[index - 1].id)}
        >
          <span aria-hidden="true">← </span>Previous
        </button>
        <select
          aria-label="Saved game"
          value={currentId}
          onChange={(event) => goTo(event.target.value)}
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
          onClick={() => goTo(games[index + 1].id)}
        >
          Next<span aria-hidden="true"> →</span>
        </button>
        <div role="status" aria-live="polite">
          {savedAt > 0 && (
            <p className="whitespace-nowrap rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              <span aria-hidden="true">✓ </span>Changes saved!
            </p>
          )}
        </div>
      </div>

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
            <Link
              href="/onboarding/games"
              className="font-medium text-emerald-700 underline dark:text-emerald-400"
            >
              Import it once more
            </Link>{" "}
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
          onEdit={() => {
            hasEdits.current = true;
          }}
          onSaved={() => {
            hasEdits.current = false;
            setSavedAt(Date.now());
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
