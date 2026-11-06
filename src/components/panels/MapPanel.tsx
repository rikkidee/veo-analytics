"use client";

import { useMemo } from "react";
import { PanelLink } from "@/components/panels/links";
import SavedGameMapper from "@/components/SavedGameMapper";
import type { MappingPreview } from "@/components/import/MappingStep";
import { isMinutesColumn, readStat, type DashboardData } from "@/lib/stats";

export default function MapPanel({
  data,
  teamId,
  onPreview,
  onSaved,
}: {
  data: DashboardData;
  teamId: string;
  onPreview: (gameId: string, preview: MappingPreview) => void;
  onSaved: (gameId: string, version: string) => void;
}) {
  const games = useMemo(
    () =>
      data.games
        .filter((game) => game.team_id === teamId)
        .toSorted((a, b) => b.game_date.localeCompare(a.game_date) || a.id.localeCompare(b.id))
        .map((game) => ({
          id: game.id,
          game_label: game.game_label,
          game_date: game.game_date,
          unassigned: data.coverage?.[game.id]?.unassigned ?? null,
        })),
    [data.games, data.coverage, teamId],
  );
  const roster = useMemo(
    () => data.players.filter((player) => player.team_id === teamId),
    [data.players, teamId],
  );
  const seasonMinutes = useMemo(() => {
    const minutes: Record<string, Record<string, number>> = {};
    for (const row of data.stats) {
      const column = Object.keys(row.stats).find(isMinutesColumn);
      const value = column === undefined ? null : readStat(column, row.stats[column]);
      if (value !== null) (minutes[row.player_id] ??= {})[row.game_id] = value;
    }
    return minutes;
  }, [data.stats]);

  if (games.length === 0) {
    return (
      <p className="text-sm">
        No saved games yet.{" "}
        <PanelLink panel="import" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Import your first games
        </PanelLink>
      </p>
    );
  }

  return (
    <SavedGameMapper
      // A roster change can remove someone a form still has chosen, so it starts over.
      key={roster.map((player) => player.id).join()}
      games={games}
      roster={roster}
      seasonMinutes={seasonMinutes}
      onPreview={onPreview}
      onSaved={onSaved}
      intro={
        <div className="text-sm">
          <p className="text-neutral-600 dark:text-neutral-400">
            Optional, and you can stop any time. Your dashboard already works, and this makes it more complete. Every
            change saves by itself and shows on the dashboard straight away.
          </p>
          <p className="mt-2">
            Notice how some players show fewer minutes than expected? That&apos;s because Veo sometimes reads jersey
            numbers incorrectly. By mapping these unmatched jerseys to the right players, you&apos;ll get the complete
            picture.
          </p>
          {/* A screenshot of Veo misreading a jersey goes here. */}
        </div>
      }
    />
  );
}
