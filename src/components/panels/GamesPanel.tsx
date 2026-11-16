"use client";

import { useState } from "react";
import { useImportRun } from "@/components/import/ImportRunner";
import { PanelLink } from "@/components/panels/links";
import type { TeamModel } from "@/lib/dashboard";
import { deleteGame, describeSaveError } from "@/lib/games";
import type { DashboardGame } from "@/lib/stats";
import { getSupabase } from "@/lib/supabase/client";

const fullDate = (isoDate: string) =>
  // Noon, so no time zone can move it to another day.
  new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

function result(own: number | null, opp: number | null) {
  if (own === null || opp === null) return null;
  const outcome = own > opp ? ["W", "text-emerald-400"] : own < opp ? ["L", "text-red-400"] : ["D", "text-neutral-300"];
  return { letter: outcome[0], color: outcome[1], score: `${own}–${opp}` };
}

/** The team's saved games, newest first, each of which can be deleted. */
export default function GamesPanel({
  team,
  games,
  onDeleted,
}: {
  team: TeamModel;
  /** This team's saved rows, for what the model leaves out, like the year. */
  games: DashboardGame[];
  onDeleted: (gameId: string) => void;
}) {
  const { busy: importing } = useImportRun();
  const [deleting, setDeleting] = useState<string | null>(null);
  // Gone from the list straight away, ahead of fresh data arriving.
  const [deleted, setDeleted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const rows = games
    .filter((game) => !deleted.includes(game.id))
    .toSorted((a, b) => b.game_date.localeCompare(a.game_date) || a.id.localeCompare(b.id))
    .map((saved) => {
      const model = team.games.find((game) => game.id === saved.id);
      return {
        saved,
        label: model?.label ?? "",
        opponent: model?.opponent ?? saved.opponent,
        result: model ? result(model.stats.Goals.own, model.stats.Goals.opp) : null,
        players: model ? team.players.filter((player) => player.perGame.has(model.label)).length : 0,
        unassigned: model?.unassignedJerseys ?? null,
      };
    });

  async function remove(row: (typeof rows)[number]) {
    const name = `${row.label}${row.opponent ? ` vs ${row.opponent}` : ""} (${fullDate(row.saved.game_date)})`;
    const sure = window.confirm(
      `Delete ${name}?\n\nThis removes the game and every player's stats from it, and season totals, leaderboards and charts update without it. It can't be undone, but you can import the game from Veo again later.`,
    );
    if (!sure) return;

    setDeleting(row.saved.id);
    setError(null);
    try {
      await deleteGame(getSupabase(), row.saved.id);
      setDeleted((current) => [...current, row.saved.id]);
      onDeleted(row.saved.id);
    } catch (cause) {
      setError(`${name} couldn't be deleted. ${describeSaveError(cause)}`);
    } finally {
      setDeleting(null);
    }
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm">
        No saved games yet.{" "}
        <PanelLink panel="import" className="font-medium text-emerald-400 underline">
          Import your games
        </PanelLink>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-neutral-400">
        {rows.length} {rows.length === 1 ? "game" : "games"} saved for this team. Deleting one takes its stats out of
        every total on the dashboard. Games are numbered by date, so the ones after it move up a number.
      </p>
      {importing && (
        <p role="status" className="text-sm text-amber-300">
          Deleting is paused while games are importing, so an import can&apos;t save a game back as it&apos;s removed.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-neutral-800 rounded-lg border border-neutral-800">
        {rows.map((row) => (
          <li key={row.saved.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-100">
                <span className="text-neutral-400">{row.label}</span> {row.opponent ? `vs ${row.opponent}` : "Opponent unknown"}
                {row.result && (
                  <span className="ml-2 whitespace-nowrap">
                    <span className={`font-semibold ${row.result.color}`}>{row.result.letter}</span> {row.result.score}
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-sm text-neutral-400">
                {fullDate(row.saved.game_date)}
                {" · "}
                {row.players} {row.players === 1 ? "player" : "players"} tracked
                {(row.unassigned ?? 0) > 0 && (
                  <>
                    {" · "}
                    <span className="text-amber-300">
                      {row.unassigned} unassigned {row.unassigned === 1 ? "jersey" : "jerseys"}
                    </span>
                  </>
                )}
              </p>
              {row.saved.game_label && row.saved.game_label !== row.opponent && (
                <p className="mt-0.5 truncate text-xs text-neutral-500" title={row.saved.game_label}>
                  {row.saved.game_label}
                </p>
              )}
            </div>
            <button
              type="button"
              className="rounded-md border border-red-900 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
              disabled={importing || deleting !== null}
              aria-label={`Delete ${row.label}${row.opponent ? ` vs ${row.opponent}` : ""}`}
              onClick={() => void remove(row)}
            >
              {deleting === row.saved.id ? "Deleting…" : "Delete"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
