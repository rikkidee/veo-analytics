import {
  EVENT_COLUMNS,
  isMinutesColumn,
  toMinutes,
  type CellValue,
  type DashboardData,
  type DashboardPlayer,
  type DashboardTeam,
} from "@/lib/stats";

export const KM_PER_MILE = 1.60934;

export const TEAM_STATS = [
  "Goals",
  "Total attempts",
  "Possession",
  "Total passes",
  "Successful passes",
  "Pass accuracy",
  "Corners",
  "Fouls",
  "Free kicks",
] as const;
export type TeamStatName = (typeof TEAM_STATS)[number];
export type TeamStat = { own: number | null; opp: number | null };

export type GameModel = {
  id: string;
  /** G1, G2... in date order. */
  label: string;
  /** Like "Sep 13". */
  date: string;
  stats: Record<TeamStatName, TeamStat>;
};

export type StatValues = Record<string, number>;

export type PlayerGame = StatValues & { "Pass %": number };

export type PlayerModel = {
  id: string;
  name: string;
  jersey: number;
  nickname: string | null;
  report: string | null;
  strengths: string | null;
  develop: string | null;
  coachNotes: string | null;
  gamesPlayed: number;
  totals: StatValues;
  per60: StatValues;
  perGame: Map<string, PlayerGame>;
};

export type TeamModel = {
  /** The short name beside "OPP", like "MIS". */
  ownLabel: string;
  games: GameModel[];
  players: PlayerModel[];
  /** False when no saved report had minutes, which per 60 stats depend on. */
  hasMinutes: boolean;
  analysis: string | null;
};

const TEAM_STAT_LABELS: Record<TeamStatName, RegExp> = {
  Goals: /^goals?$/i,
  "Total attempts": /^(total )?(attempts|shots)$/i,
  Possession: /^possession/i,
  "Total passes": /^(total )?passes$/i,
  "Successful passes": /^(successful passes|passes successful)$/i,
  "Pass accuracy": /^(pass(es)? accuracy|passes success rate)$/i,
  Corners: /^corners?$/i,
  Fouls: /^fouls?$/i,
  "Free kicks": /^free[- ]kicks?$/i,
};

const PLAYER_COLUMNS: [string, RegExp][] = [
  ["Distance tracked", /^distance/i],
  ["Goals", /^goals?$/i],
  ["Shots", /^shots?$/i],
  ["Total attempts", /^(total )?attempts$/i],
  ["Tackles", /^tackles?$/i],
  ["Passes", /^(total )?passes$/i],
  ["Passes successful", /^(passes successful|successful passes)$/i],
  ["Dribbles", /^dribbles?$/i],
  ["Duels", /^duels?$/i],
  ["Interceptions", /^interceptions?$/i],
  ["Loose ball recoveries", /^(loose ball )?recoveries$|^loose ball recoveries$/i],
  ["Corners", /^corners?$/i],
  ["Sprints", /^sprints?$/i],
  ["Top speed", /^top speed/i],
  ["High-intensity runs", /^high[- ]intensity/i],
  ["Free kicks", /^free[- ]kicks?$/i],
  ["Throw-ins", /^throw[- ]ins?$/i],
  ["Fouls", /^fouls?$/i],
  ["Saves", /^saves?$/i],
];

// A few minutes can give a huge per 60 rate, so only regulars set comparisons.
const MIN_MINUTES_FOR_COMPARISON = 30;

/** The players whose per 60 rates set the team's best and average. */
export function comparisonPlayers(players: PlayerModel[]) {
  const regulars = players.filter(
    (player) => (player.totals["Minutes tracked"] ?? 0) >= MIN_MINUTES_FOR_COMPARISON,
  );
  return regulars.length > 0 ? regulars : players;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Reads 6.8, "6.8", "1,204" or "6.8 mi". The scraper keeps anything with a unit as text. */
function leadingNumber(value: CellValue) {
  if (typeof value === "number") return value;
  const match = value?.trim().match(/^-?\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

/** Distances and speeds are held in miles, as the Veo report shows them, unless marked metric. */
function inMiles(value: CellValue) {
  const number = leadingNumber(value);
  if (number === null) return null;
  return typeof value === "string" && /\bkm|\bkph\b/i.test(value) ? number / KM_PER_MILE : number;
}

function readCell(column: string, value: CellValue) {
  if (column === "Minutes tracked") return toMinutes(value) ?? leadingNumber(value);
  if (column === "Distance tracked" || column === "Top speed") return inMiles(value);
  return leadingNumber(value);
}

function readLine(cells: Record<string, CellValue>): StatValues {
  const line: StatValues = {};
  for (const [header, value] of Object.entries(cells)) {
    const column = isMinutesColumn(header)
      ? "Minutes tracked"
      : PLAYER_COLUMNS.find(([, pattern]) => pattern.test(header.trim()))?.[0];
    const number = column ? readCell(column, value) : null;
    if (column && number !== null) line[column] = number;
  }
  return line;
}

function formatShortDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(parsed);
}

/**
 * The first number in a stat card is treated as this team's and the second as the
 * opponent's, since that's the order they're read from the report.
 */
function readTeamStats(raw: Record<string, { values?: number[] }> | null) {
  const entries = Object.entries(raw ?? {});
  return Object.fromEntries(
    TEAM_STATS.map((stat) => {
      const values = entries.find(([label]) => TEAM_STAT_LABELS[stat].test(label.trim()))?.[1].values;
      return [stat, { own: values?.[0] ?? null, opp: values?.[1] ?? null }];
    }),
  ) as Record<TeamStatName, TeamStat>;
}

/** "Mid-Isle Soccer Club" gives "MIS", falling back to "Team" when no club is set. */
function shortLabel(team: DashboardTeam | undefined) {
  const initials = (team?.club ?? "")
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase())
    .join("");
  return initials.slice(0, 3) || "Team";
}

function buildPlayer(
  player: DashboardPlayer,
  data: DashboardData,
  games: GameModel[],
): PlayerModel {
  const perGame = new Map<string, PlayerGame>();
  for (const game of games) {
    const row = data.stats.find((stat) => stat.game_id === game.id && stat.player_id === player.id);
    const corrections = data.corrections.filter(
      (correction) => correction.game_id === game.id && correction.player_id === player.id,
    );
    if (!row && corrections.length === 0) continue;

    const line = readLine(row?.stats ?? {});
    for (const correction of corrections) {
      const column = EVENT_COLUMNS[correction.event_type];
      if (column) line[column] = (line[column] ?? 0) + (correction.value ?? 1);
    }
    const passes = line.Passes ?? 0;
    const accuracy = passes > 0 ? Math.round(((line["Passes successful"] ?? 0) / passes) * 100) : 0;
    perGame.set(game.label, { ...line, "Pass %": accuracy });
  }

  const totals: StatValues = {};
  for (const line of perGame.values()) {
    for (const [column, value] of Object.entries(line)) {
      if (column === "Pass %") continue;
      totals[column] =
        column === "Top speed" ? Math.max(totals[column] ?? 0, value) : round1((totals[column] ?? 0) + value);
    }
  }

  const minutes = totals["Minutes tracked"] ?? 0;
  const per60 = Object.fromEntries(
    Object.entries(totals).map(([column, value]) => [
      column,
      column === "Top speed" ? value : minutes > 0 ? round1((value / minutes) * 60) : 0,
    ]),
  );

  return {
    id: player.id,
    name: player.name,
    jersey: player.default_jersey,
    nickname: player.nickname ?? null,
    report: player.scouting_report ?? null,
    strengths: player.strengths ?? null,
    develop: player.areas_to_develop ?? null,
    coachNotes: player.coach_notes ?? null,
    gamesPlayed: perGame.size,
    totals,
    per60,
    perGame,
  };
}

/** Puts one team's saved rows into the shape the dashboard's tabs read. */
export function buildTeamModel(data: DashboardData, teamId: string): TeamModel {
  const team = data.teams.find((other) => other.id === teamId);
  const games = data.games
    .filter((game) => game.team_id === teamId)
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
    .map((game, index): GameModel => ({
      id: game.id,
      label: `G${index + 1}`,
      date: formatShortDate(game.game_date),
      stats: readTeamStats(game.team_stats),
    }));

  const players = data.players
    .filter((player) => player.team_id === teamId)
    .map((player) => buildPlayer(player, data, games))
    .filter((player) => player.gamesPlayed > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ownLabel: shortLabel(team),
    games,
    players,
    hasMinutes: players.some((player) => (player.totals["Minutes tracked"] ?? 0) > 0),
    analysis: team?.analysis ?? null,
  };
}
