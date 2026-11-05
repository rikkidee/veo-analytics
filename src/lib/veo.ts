import { combineStats, EVENT_COLUMNS, isMinutesColumn, toMinutes, type StatLine } from "@/lib/stats";

export type VeoPlayerRow = {
  jersey: number | null;
  /** Absent on reports read before names were captured. */
  name?: string | null;
  cells: StatLine;
};

export type VeoKeyEvent = {
  type: "goal" | "shot";
  time: string | null;
  jersey: number | null;
  /** The name Veo credits, as in "Shot by Deanna Motley". */
  player?: string | null;
  description: string;
};

/** What chrome-extension/content.js reads from one match report. */
export type VeoPayload = {
  schemaVersion: 2;
  source: "veo";
  slug: string;
  veoUrl: string;
  scrapedAt: string;
  pageTitle: string;
  columnCount: string | null;
  teamStats: Record<string, { text: string; values: number[] }>;
  players: { headers: string[]; rows: VeoPlayerRow[] };
  keyEvents: VeoKeyEvent[];
  warnings: string[];
};

export type VeoTeam = {
  id: string;
  clubSlug: string;
  name: string;
  recordingsUrl: string;
};

export type VeoGame = {
  slug: string;
  title: string;
  date: string | null;
  opponent: string | null;
  /** null when the recordings page doesn't say either way. */
  hasReport: boolean | null;
};

export type RosterPlayer = {
  id: string;
  team_id: string;
  name: string;
  default_jersey: number;
};

export const NOISE = "noise";
/** A roster player's id, NOISE, or "" while undecided. */
export type JerseyChoice = string;

export function reportUrl(slug: string) {
  return `https://app.veo.co/matches/${slug}/report`;
}

export function matchVideoUrl(slug: string) {
  return `https://app.veo.co/matches/${slug}/`;
}

/** Minutes each jersey played. A jersey with no readable minutes is left out. */
export function minutesByJersey(payload: VeoPayload) {
  const minutes = new Map<number, number>();
  for (const { jersey, cells } of payload.players.rows) {
    const column = Object.keys(cells).find(isMinutesColumn);
    const value = column === undefined ? null : toMinutes(cells[column]);
    if (jersey !== null && value !== null) {
      minutes.set(jersey, (minutes.get(jersey) ?? 0) + value);
    }
  }
  return minutes;
}

export function detectedJerseys(payload: VeoPayload): number[] {
  const jerseys = payload.players.rows
    .map((row) => row.jersey)
    .filter((jersey): jersey is number => jersey !== null);
  return [...new Set(jerseys)].sort((a, b) => a - b);
}

/** Suggests a player only when the jersey points to exactly one person. */
export function suggestPlayer(jersey: number, roster: RosterPlayer[]): string {
  const matches = roster.filter((player) => player.default_jersey === jersey);
  return matches.length === 1 ? matches[0].id : "";
}

export type EventAssignment = { type: VeoKeyEvent["type"]; playerId: string };

const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Prefers the jersey decision for the player table row with this name, so a
 * changed mapping carries over. Otherwise needs exactly one roster player by name.
 */
function findEventPlayer(
  name: string,
  payload: VeoPayload,
  choices: Record<number, JerseyChoice>,
  roster: RosterPlayer[],
): string | null {
  const wanted = normalizeName(name);
  const row = payload.players.rows.find(
    (other) => other.jersey !== null && other.name && normalizeName(other.name) === wanted,
  );
  const choice = row?.jersey == null ? "" : choices[row.jersey];
  if (choice === NOISE) return null;
  if (choice) return choice;

  const matches = roster.filter((player) => normalizeName(player.name) === wanted);
  return matches.length === 1 ? matches[0].id : null;
}

/**
 * Sorts events credited by name from those needing a person to decide. Events
 * carrying a jersey are in neither list, as the player table already covers them.
 * `index` is the event's position in the payload, which stays the same when a
 * jersey decision moves events between lists.
 */
export function attributeEvents(
  payload: VeoPayload,
  choices: Record<number, JerseyChoice>,
  roster: RosterPlayer[],
) {
  const matched: { event: VeoKeyEvent; playerId: string }[] = [];
  const unassigned: { event: VeoKeyEvent; index: number }[] = [];
  payload.keyEvents.forEach((event, index) => {
    if (event.jersey !== null) return;
    const playerId = event.player ? findEventPlayer(event.player, payload, choices, roster) : null;
    if (playerId) matched.push({ event, playerId });
    else unassigned.push({ event, index });
  });
  return { matched, unassigned };
}

/**
 * Each assignment adds 1 to the player's total, and Veo's table may already count
 * the event. Only what the table is missing gets added: a player with 2 named
 * shots and "Shots: 2" gets nothing, and with no Shots column gets 2.
 */
export function creditsForMatchedEvents(
  payload: VeoPayload,
  matched: { event: VeoKeyEvent; playerId: string }[],
  choices: Record<number, JerseyChoice>,
): EventAssignment[] {
  const counts = new Map<string, EventAssignment & { count: number }>();
  for (const { event, playerId } of matched) {
    const key = `${playerId}:${event.type}`;
    const entry = counts.get(key) ?? { type: event.type, playerId, count: 0 };
    counts.set(key, { ...entry, count: entry.count + 1 });
  }

  return [...counts.values()].flatMap(({ type, playerId, count }) => {
    const column = EVENT_COLUMNS[type].toLowerCase();
    const inTable = payload.players.rows
      .filter((row) => row.jersey !== null && choices[row.jersey] === playerId)
      .flatMap((row) => Object.entries(row.cells))
      .filter(([header]) => header.trim().toLowerCase() === column)
      .reduce((sum, [, value]) => sum + (typeof value === "number" ? value : 0), 0);
    return Array.from({ length: Math.max(0, count - inTable) }, () => ({ type, playerId }));
  });
}

export type PlayerGameStatRecord = {
  player_id: string;
  stats: StatLine;
  is_corrected: boolean;
};

/**
 * Turns jersey decisions into one stat record per player. Veo can misread a shirt
 * and split one player across two jerseys. The database allows one record per
 * player per game, so those rows are combined.
 */
export function buildPlayerStats(
  payload: VeoPayload,
  choices: Record<number, JerseyChoice>,
  roster: RosterPlayer[],
): PlayerGameStatRecord[] {
  const rowsByPlayer = new Map<string, VeoPlayerRow[]>();
  for (const row of payload.players.rows) {
    if (row.jersey === null) continue;
    const playerId = choices[row.jersey];
    if (!playerId || playerId === NOISE) continue;
    rowsByPlayer.set(playerId, [...(rowsByPlayer.get(playerId) ?? []), row]);
  }

  return [...rowsByPlayer].map(([playerId, rows]) => {
    const player = roster.find((other) => other.id === playerId);
    const remapped = rows.some((row) => row.jersey !== player?.default_jersey);
    if (rows.length === 1) {
      return { player_id: playerId, stats: rows[0].cells, is_corrected: remapped };
    }
    return {
      player_id: playerId,
      // Text columns such as the player cell have no meaningful combined value.
      stats: combineStats(rows.map((row) => row.cells)),
      is_corrected: true,
    };
  });
}
