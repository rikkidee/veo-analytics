import {
  EVENT_COLUMNS,
  isMinutesColumn,
  isSamePerson,
  readStat,
  type CellValue,
  type DashboardData,
  type DashboardGame,
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
  opponent: string | null;
  stats: Record<TeamStatName, TeamStat>;
  /** False when the saved report has no team numbers, so only player totals fill in. */
  hasTeamStats: boolean;
  /** Jerseys in this game not assigned to anyone yet, or null if that's not known. */
  unassignedJerseys: number | null;
  /** Veo's speeds here are far above the team's other games. See flagHighTracking. */
  trackingLooksHigh: boolean;
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
  id: string;
  /** People on the roster, counting any spelled two ways once. */
  rosterSize: number;
  /** The short name beside "OPP", like "MIS". */
  ownLabel: string;
  games: GameModel[];
  players: PlayerModel[];
  /** False when no saved report had minutes, which per 60 stats depend on. */
  hasMinutes: boolean;
  /** True when some of a team's saved rows have no minutes, so per 60 leaves them out. */
  missingMinutes: boolean;
  analysis: string | null;
  /** Written by AI, where `analysis` is written by hand. */
  teamAnalysis: string | null;
  /** What the coach wants that analysis to take into account. */
  coachContext: string | null;
};

// Loose enough for wording like "Goals scored" or "Ball possession". The more
// specific passing labels are tried with "Total passes" ruling them out.
const TEAM_STAT_LABELS: Record<TeamStatName, RegExp> = {
  Goals: /^(total )?goals?\b(?! kick)/i,
  "Total attempts": /^(total )?(attempts|shots)\b(?!.*\b(on|off) target)/i,
  Possession: /\bpossession\b/i,
  "Total passes": /^(total )?pass(es)?$|^passes (total|attempted)$/i,
  "Successful passes": /\b(successful|completed) pass|^pass(es)? (successful|completed)$/i,
  "Pass accuracy": /^pass(es|ing)? (accuracy|success)/i,
  Corners: /^corner( kick)?s?\b/i,
  Fouls: /^fouls?\b/i,
  "Free kicks": /^free[- ]kicks?\b/i,
};

// What a team total can be built from when the report's own number is missing.
const PLAYER_COLUMN_FOR_TEAM_STAT: Partial<Record<TeamStatName, string>> = {
  Goals: "Goals",
  "Total attempts": "Total attempts",
  "Total passes": "Passes",
  "Successful passes": "Passes successful",
  Corners: "Corners",
  Fouls: "Fouls",
  "Free kicks": "Free kicks",
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

/** Pass accuracy across everything a player has played. */
export function passAccuracy(player: Pick<PlayerModel, "totals">) {
  const passes = player.totals.Passes ?? 0;
  return passes > 0 ? Math.round(((player.totals["Passes successful"] ?? 0) / passes) * 100) : 0;
}

/** Average per game, counting only games that recorded this stat, so a gap can't look like a zero. */
export function averagePerGame(player: Pick<PlayerModel, "perGame">, column: string) {
  const values = [...player.perGame.values()].flatMap((line) => (column in line ? [line[column]] : []));
  return values.length > 0 ? round1(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

/** Tidies a nickname: "\"The Motor\"" or "The Motor The Motor" becomes "The Motor". */
export function cleanNickname(nickname: string | null | undefined) {
  const unquoted = (nickname ?? "").trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  return unquoted.replace(/^(.+?)(?:\s*[-–—,:]\s*|\s+)\1$/i, "$1") || null;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

function readLine(cells: Record<string, CellValue>): StatValues {
  const line: StatValues = {};
  for (const [header, value] of Object.entries(cells)) {
    const column = isMinutesColumn(header)
      ? "Minutes tracked"
      : PLAYER_COLUMNS.find(([, pattern]) => pattern.test(header.trim()))?.[0];
    const number = column ? readStat(header, value) : null;
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
function readTeamStats(raw: DashboardGame["team_stats"], swapped: boolean) {
  const entries = Object.entries(raw ?? {});
  const [ownIndex, oppIndex] = swapped ? [1, 0] : [0, 1];
  const stats = Object.fromEntries(
    TEAM_STATS.map((stat) => {
      const values = entries.find(([label]) => TEAM_STAT_LABELS[stat].test(label.trim()))?.[1].values;
      return [stat, { own: values?.[ownIndex] ?? null, opp: values?.[oppIndex] ?? null }];
    }),
  ) as Record<TeamStatName, TeamStat>;

  // The Goals card wins when there is one, as the header's score comes from scanning the page.
  const score = raw?.Score?.values;
  if (stats.Goals.own === null && stats.Goals.opp === null && score?.length === 2) {
    stats.Goals = { own: score[ownIndex], opp: score[oppIndex] };
  }
  return stats;
}

const simplify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Whether a name from a report's header is this team, by its name or club. */
function namesThisTeam(headerName: string, team: DashboardTeam | undefined) {
  const header = simplify(headerName);
  return [team?.name, team?.club].some((name) => {
    const own = simplify(name ?? "");
    return own.length > 0 && header.length > 0 && (own.includes(header) || header.includes(own));
  });
}

/** Stats are in page order, so this team comes second only when the header says so. */
function isListedSecond(names: string[] | undefined, team: DashboardTeam | undefined) {
  return Boolean(names && !namesThisTeam(names[0], team) && namesThisTeam(names[1], team));
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

function addLine(line: StatValues, more: StatValues) {
  for (const [column, value] of Object.entries(more)) {
    line[column] = column === "Top speed" ? Math.max(line[column] ?? 0, value) : (line[column] ?? 0) + value;
  }
}

function buildPlayer(
  player: DashboardPlayer,
  ids: Set<string>,
  data: DashboardData,
  games: GameModel[],
): PlayerModel {
  const perGame = new Map<string, PlayerGame>();
  for (const game of games) {
    const rows = data.stats.filter((stat) => stat.game_id === game.id && ids.has(stat.player_id));
    const corrections = data.corrections.filter(
      (correction) => correction.game_id === game.id && correction.player_id !== null && ids.has(correction.player_id),
    );
    if (rows.length === 0 && corrections.length === 0) continue;

    const line: StatValues = {};
    for (const row of rows) addLine(line, readLine(row.stats));
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

  // Only games with minutes count towards a rate. Otherwise a game whose minutes
  // are missing adds its stats without its time, which inflates every per 60 number.
  const timedTotals: StatValues = {};
  for (const line of perGame.values()) {
    if (!(line["Minutes tracked"] > 0)) continue;
    for (const [column, value] of Object.entries(line)) {
      if (column !== "Pass %" && column !== "Top speed") timedTotals[column] = (timedTotals[column] ?? 0) + value;
    }
  }
  const minutes = timedTotals["Minutes tracked"] ?? 0;
  const per60 = Object.fromEntries(
    Object.keys(totals).map((column) => [
      column,
      column === "Top speed" ? totals[column] : minutes > 0 ? round1((round1(timedTotals[column] ?? 0) / minutes) * 60) : 0,
    ]),
  );

  return {
    id: player.id,
    name: player.name,
    jersey: player.default_jersey,
    nickname: cleanNickname(player.nickname),
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

/** Totals this team's own numbers from its players wherever the report's are missing. */
function fillFromPlayers(games: GameModel[], players: PlayerModel[]) {
  for (const game of games) {
    const lines = players.flatMap((player) => player.perGame.get(game.label) ?? []);
    if (lines.length === 0) continue;
    for (const [stat, column] of Object.entries(PLAYER_COLUMN_FOR_TEAM_STAT)) {
      const entry = game.stats[stat as TeamStatName];
      if (entry.own === null && lines.some((line) => column in line)) {
        entry.own = Math.round(lines.reduce((sum, line) => sum + (line[column] ?? 0), 0));
      }
    }
    const { own: passes } = game.stats["Total passes"];
    const { own: successful } = game.stats["Successful passes"];
    if (game.stats["Pass accuracy"].own === null && passes && successful !== null) {
      game.stats["Pass accuracy"].own = Math.round((successful / passes) * 100);
    }
  }
}

const median = (values: number[]) => {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Well clear of normal game-to-game variation, which runs to about 1.2 times.
const HIGH_TRACKING_RATIO = 1.3;
// A few minutes on the field doesn't say much about how a game was tracked.
const MIN_MINUTES_FOR_TRACKING = 10;

/**
 * Marks games whose typical top speed is far above the team's other games. Speed,
 * sprints and high-intensity runs all rise together in such a game, which suggests
 * Veo's tracking ran high. They're only marked, as the numbers are what Veo reported.
 */
function flagHighTracking(games: GameModel[], players: PlayerModel[]) {
  const typicalSpeed = games.map((game) => {
    const speeds = players.flatMap((player) => {
      const line = player.perGame.get(game.label);
      return line?.["Top speed"] && (line["Minutes tracked"] ?? 0) >= MIN_MINUTES_FOR_TRACKING ? [line["Top speed"]] : [];
    });
    return speeds.length > 0 ? median(speeds) : null;
  });
  games.forEach((game, index) => {
    const own = typicalSpeed[index];
    const others = typicalSpeed.flatMap((speed, other) => (other !== index && speed !== null ? [speed] : []));
    game.trackingLooksHigh = own !== null && others.length >= 2 && own > median(others) * HIGH_TRACKING_RATIO;
  });
}

/**
 * Folds roster entries for one person, like "Celeste" and "celeste", into one player
 * with all their stats. The capitalized spelling wins, and report fields fill any gaps.
 */
function mergeDuplicates(roster: DashboardPlayer[]) {
  const isLowercase = (player: DashboardPlayer) => player.name === player.name.toLowerCase();
  const merged: { player: DashboardPlayer; ids: Set<string> }[] = [];
  for (const entry of roster.toSorted((a, b) => Number(isLowercase(a)) - Number(isLowercase(b)))) {
    const person = { name: entry.name, jersey: entry.default_jersey };
    const existing = merged.find(({ player }) => isSamePerson({ name: player.name, jersey: player.default_jersey }, person));
    if (existing) {
      existing.ids.add(entry.id);
      existing.player = {
        ...existing.player,
        nickname: existing.player.nickname ?? entry.nickname,
        scouting_report: existing.player.scouting_report ?? entry.scouting_report,
        strengths: existing.player.strengths ?? entry.strengths,
        areas_to_develop: existing.player.areas_to_develop ?? entry.areas_to_develop,
        coach_notes: existing.player.coach_notes ?? entry.coach_notes,
      };
    } else {
      merged.push({ player: entry, ids: new Set([entry.id]) });
    }
  }
  return merged;
}

/** Puts one team's saved rows into the shape the dashboard's tabs read. */
export function buildTeamModel(data: DashboardData, teamId: string): TeamModel {
  const team = data.teams.find((other) => other.id === teamId);
  const games = data.games
    .filter((game) => game.team_id === teamId)
    .sort((a, b) => a.game_date.localeCompare(b.game_date))
    .map((game, index): GameModel => {
      const names = game.team_stats?.Score?.teams;
      const swapped = isListedSecond(names, team);
      return {
        id: game.id,
        label: `G${index + 1}`,
        date: formatShortDate(game.game_date),
        opponent: game.opponent ?? names?.[swapped ? 0 : 1] ?? null,
        stats: readTeamStats(game.team_stats, swapped),
        unassignedJerseys: data.coverage?.[game.id]?.unassigned ?? null,
        trackingLooksHigh: false,
        hasTeamStats: Object.entries(game.team_stats ?? {}).some(
          ([label, card]) => label !== "Score" && (card.values?.length ?? 0) >= 2,
        ),
      };
    });

  const roster = mergeDuplicates(data.players.filter((player) => player.team_id === teamId));
  const players = roster
    .map(({ player, ids }) => buildPlayer(player, ids, data, games))
    .filter((player) => player.gamesPlayed > 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  fillFromPlayers(games, players);
  flagHighTracking(games, players);

  return {
    id: teamId,
    rosterSize: roster.length,
    ownLabel: shortLabel(team),
    games,
    players,
    hasMinutes: players.some((player) => (player.totals["Minutes tracked"] ?? 0) > 0),
    missingMinutes: players.some((player) =>
      [...player.perGame.values()].some((line) => line["Minutes tracked"] === undefined),
    ),
    analysis: team?.analysis ?? null,
    teamAnalysis: team?.team_analysis ?? null,
    coachContext: team?.coach_context ?? null,
  };
}
