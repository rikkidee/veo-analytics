import { combineStats, type StatLine } from "@/lib/stats";

export type VeoPlayerRow = {
  jersey: number | null;
  cells: StatLine;
};

export type VeoKeyEvent = {
  type: "goal" | "shot";
  time: string | null;
  jersey: number | null;
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

export function unassignedEvents(payload: VeoPayload) {
  return payload.keyEvents.filter((event) => event.jersey === null);
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
