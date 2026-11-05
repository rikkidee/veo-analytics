import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildPlayerStats,
  NOISE,
  type JerseyChoice,
  type RosterPlayer,
  type VeoPayload,
} from "@/lib/veo";

export type SaveGameInput = {
  teamId: string;
  payload: VeoPayload;
  label: string;
  date: string;
  opponent: string;
  roster: RosterPlayer[];
  choices: Record<number, JerseyChoice>;
  /** One entry per goal or shot assigned to a player by hand. */
  eventAssignments: { type: "goal" | "shot"; playerId: string }[];
};

/**
 * Writes one game and everything under it. A game already imported from the same
 * Veo report is replaced, so importing twice can't double a player's numbers.
 *
 * These are separate requests, not a transaction. If one fails, the error reaches
 * the wizard, which keeps its data, and saving again rewrites the game cleanly.
 */
export async function saveGame(supabase: SupabaseClient, input: SaveGameInput) {
  const { teamId, payload, roster, choices, eventAssignments } = input;

  const fields = {
    team_id: teamId,
    game_label: input.label.trim(),
    game_date: input.date,
    opponent: input.opponent.trim() || null,
    veo_url: payload.veoUrl,
    team_stats: payload.teamStats,
  };

  const { data: existing, error: lookupError } = await supabase
    .from("games")
    .select("id")
    .eq("team_id", teamId)
    .eq("veo_url", payload.veoUrl)
    .limit(1);
  if (lookupError) throw lookupError;

  let gameId: string = existing[0]?.id;
  if (gameId) {
    const { error } = await supabase.from("games").update(fields).eq("id", gameId);
    if (error) throw error;
    for (const table of ["jersey_mappings", "player_game_stats", "event_corrections"]) {
      const { error: deleteError } = await supabase.from(table).delete().eq("game_id", gameId);
      if (deleteError) throw deleteError;
    }
  } else {
    const { data, error } = await supabase.from("games").insert(fields).select("id").single();
    if (error) throw error;
    gameId = data.id;
  }

  const mappings = Object.entries(choices)
    .filter(([, choice]) => choice)
    .map(([jersey, choice]) => ({
      game_id: gameId,
      detected_jersey: Number(jersey),
      player_id: choice === NOISE ? null : choice,
      is_noise: choice === NOISE,
    }));
  if (mappings.length > 0) {
    const { error } = await supabase.from("jersey_mappings").insert(mappings);
    if (error) throw error;
  }

  const stats = buildPlayerStats(payload, choices, roster).map((record) => ({
    ...record,
    game_id: gameId,
  }));
  if (stats.length > 0) {
    const { error } = await supabase.from("player_game_stats").insert(stats);
    if (error) throw error;
  }

  if (eventAssignments.length > 0) {
    const { error } = await supabase.from("event_corrections").insert(
      eventAssignments.map((assignment) => ({
        game_id: gameId,
        player_id: assignment.playerId,
        event_type: assignment.type,
        value: 1,
      })),
    );
    if (error) throw error;
  }

  return gameId;
}

export function describeSaveError(cause: unknown) {
  const { code, message } = (cause ?? {}) as { code?: string; message?: string };
  // PGRST205: the table isn't in the API's schema. 42P01: Postgres has no such table.
  if (code === "PGRST205" || code === "42P01") {
    return "The database isn't set up yet. Run supabase/schema.sql in the Supabase SQL Editor, then save again.";
  }
  return message || "Could not save this game.";
}
