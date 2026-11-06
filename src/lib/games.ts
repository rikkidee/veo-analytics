import type { SupabaseClient } from "@supabase/supabase-js";
import { readStat, type StatLine } from "@/lib/stats";
import {
  attributeEvents,
  autoChoices,
  buildPlayerStats,
  creditsForMatchedEvents,
  NOISE,
  type JerseyChoice,
  type RosterPlayer,
  type VeoGame,
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
  /** One entry per goal or shot credited to a player. `eventIndex` marks a hand assignment. */
  eventAssignments: { type: "goal" | "shot"; playerId: string; eventIndex?: number }[];
};

export type SavedGame = {
  label: string;
  date: string;
  opponent: string | null;
  teamId: string;
  /** Null for games saved before reports were kept. */
  payload: VeoPayload | null;
  choices: Record<number, JerseyChoice>;
  eventChoices: Record<number, string>;
};

/** Loads a saved game and the decisions made on it, ready to edit. */
export async function loadSavedGame(supabase: SupabaseClient, gameId: string): Promise<SavedGame> {
  const [game, mappings, corrections] = await Promise.all([
    supabase
      .from("games")
      .select("game_label, game_date, opponent, team_id, veo_payload")
      .eq("id", gameId)
      .single(),
    supabase.from("jersey_mappings").select("detected_jersey, player_id, is_noise").eq("game_id", gameId),
    supabase
      .from("event_corrections")
      .select("event_index, player_id")
      .eq("game_id", gameId)
      .not("event_index", "is", null),
  ]);
  const failure = game.error ?? mappings.error ?? corrections.error;
  if (failure) throw failure;

  return {
    label: game.data!.game_label,
    date: game.data!.game_date,
    opponent: game.data!.opponent,
    teamId: game.data!.team_id,
    payload: game.data!.veo_payload,
    choices: Object.fromEntries(
      mappings.data!.map((row) => [row.detected_jersey, row.is_noise ? NOISE : (row.player_id ?? "")]),
    ),
    eventChoices: Object.fromEntries(corrections.data!.map((row) => [row.event_index, row.player_id])),
  };
}

// A save replaces a game's rows over several requests, so two at once could interleave.
// Mapping saves as people click, and an import can be saving at the same time.
let writes: Promise<unknown> = Promise.resolve();

function inTurn<T>(work: () => Promise<T>) {
  const result = writes.then(work);
  writes = result.catch(() => {});
  return result;
}

/** Resolves once saves already started are done, so a read sees what they wrote. */
export const afterPendingWrites = () => writes;

/**
 * Writes one game and everything under it. A game already imported from the same
 * Veo report is replaced, so importing twice can't double a player's numbers.
 *
 * These are separate requests, not a transaction. If one fails, the error reaches
 * the caller, and saving again rewrites the game cleanly.
 */
export function saveGame(supabase: SupabaseClient, input: SaveGameInput) {
  return inTurn(() => writeGame(supabase, input));
}

/**
 * One player's numbers in a game, written so the same numbers always read the same.
 * Compared by value, as a saved row can hold 30 where the report says "30min". Rounded
 * as saved rows can hold more digits than the report shows.
 */
function fingerprints(
  stats: { player_id: string; stats: StatLine }[],
  corrections: { player_id: string | null; event_type: string }[],
) {
  const byPlayer = new Map<string, { stats: unknown[]; corrections: string[] }>();
  const entry = (playerId: string) => {
    if (!byPlayer.has(playerId)) byPlayer.set(playerId, { stats: [], corrections: [] });
    return byPlayer.get(playerId)!;
  };
  for (const row of stats) {
    entry(row.player_id).stats = Object.entries(row.stats)
      .flatMap(([column, value]) => {
        const number = readStat(column, value);
        return number === null ? [] : [[column, Math.round(number * 10) / 10]];
      })
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
  }
  for (const row of corrections) {
    if (row.player_id) entry(row.player_id).corrections.push(row.event_type);
  }
  return new Map(
    [...byPlayer].map(([playerId, { stats: line, corrections: events }]) => [
      playerId,
      JSON.stringify([line, events.sort()]),
    ]),
  );
}

async function writeGame(supabase: SupabaseClient, input: SaveGameInput) {
  const { teamId, payload, roster, choices, eventAssignments } = input;

  const fields = {
    team_id: teamId,
    game_label: input.label.trim(),
    game_date: input.date,
    opponent: input.opponent.trim() || null,
    veo_url: payload.veoUrl,
    team_stats: payload.teamStats,
    veo_payload: payload,
  };

  const { data: existing, error: lookupError } = await supabase
    .from("games")
    .select("id")
    .eq("team_id", teamId)
    .eq("veo_url", payload.veoUrl)
    .limit(1);
  if (lookupError) throw lookupError;

  let gameId: string = existing[0]?.id;
  // A new game has nothing to compare with, and every report is due a rewrite for it anyway.
  let before: Map<string, string> | null = null;
  if (gameId) {
    const [oldStats, oldCorrections] = await Promise.all([
      supabase.from("player_game_stats").select("player_id, stats").eq("game_id", gameId),
      supabase.from("event_corrections").select("player_id, event_type").eq("game_id", gameId),
    ]);
    if (oldStats.error) throw oldStats.error;
    if (oldCorrections.error) throw oldCorrections.error;
    before = fingerprints(oldStats.data, oldCorrections.data);
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
        event_index: assignment.eventIndex ?? null,
      })),
    );
    if (error) throw error;
  }

  if (before) {
    const after = fingerprints(
      stats,
      eventAssignments.map(({ playerId, type }) => ({ player_id: playerId, event_type: type })),
    );
    const changed = [...new Set([...before.keys(), ...after.keys()])].filter(
      (playerId) => before.get(playerId) !== after.get(playerId),
    );
    if (changed.length > 0) {
      // Only drives a hint on the profile, so a failure here shouldn't fail the save.
      await supabase.from("players").update({ stats_changed_at: new Date().toISOString() }).in("id", changed);
    }
  }

  return gameId;
}

/**
 * Saves a report without asking anything, leaving jerseys it can't place unassigned.
 * Importing a saved game again keeps what people decided or edited on it.
 */
export function autoSaveGame(
  supabase: SupabaseClient,
  input: { teamId: string; payload: VeoPayload; game: VeoGame | null; roster: RosterPlayer[] },
) {
  // In one turn, so a mapping change can't land between reading and rewriting the game.
  return inTurn(() => autoWriteGame(supabase, input));
}

async function autoWriteGame(
  supabase: SupabaseClient,
  input: { teamId: string; payload: VeoPayload; game: VeoGame | null; roster: RosterPlayer[] },
) {
  const { teamId, payload, game, roster } = input;
  const { data: found, error } = await supabase
    .from("games")
    .select("id")
    .eq("team_id", teamId)
    .eq("veo_url", payload.veoUrl)
    .limit(1);
  if (error) throw error;
  const saved = found[0] ? await loadSavedGame(supabase, found[0].id) : null;

  const choices = autoChoices(payload, roster, saved?.choices);
  const { matched, unassigned } = attributeEvents(payload, choices, roster);
  await writeGame(supabase, {
    teamId,
    payload,
    roster,
    choices,
    label: saved?.label || game?.title || payload.pageTitle || "Untitled game",
    // The date has to exist, and can be corrected from Map Jerseys if Veo's couldn't be read.
    date: saved?.date || game?.date || payload.scrapedAt.slice(0, 10),
    opponent: saved?.opponent || game?.opponent || "",
    eventAssignments: [
      ...creditsForMatchedEvents(payload, matched, choices),
      ...unassigned.flatMap(({ event, index }) => {
        const playerId = saved?.eventChoices[index];
        return playerId ? [{ type: event.type, playerId, eventIndex: index }] : [];
      }),
    ],
  });
}

export function describeSaveError(cause: unknown) {
  const { code, message } = (cause ?? {}) as { code?: string; message?: string };
  // PGRST205: the table isn't in the API's schema. 42P01: Postgres has no such table.
  if (code === "PGRST205" || code === "42P01") {
    return "The database isn't set up yet. Run supabase/schema.sql in the Supabase SQL Editor, then save again.";
  }
  // PGRST204 and 42703: a column the app needs is missing.
  if (code === "PGRST204" || code === "42703") {
    return "The database needs an update. Run supabase/add-saved-game-editing.sql in the Supabase SQL Editor, then try again.";
  }
  return message || "Could not save this game.";
}
