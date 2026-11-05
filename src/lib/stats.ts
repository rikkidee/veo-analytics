export type CellValue = string | number | null;
export type StatLine = Record<string, CellValue>;

/** Columns that identify a player rather than measure anything. */
export function isIdentityColumn(column: string) {
  return /^(jersey|shirt|number$|#$|no\.?$|player|name|position)/i.test(column.trim());
}

export function isMinutesColumn(column: string) {
  return /^(minutes|mins?\b|time played|playing time)/i.test(column.trim());
}

const isRate = (column: string) => /\b(rate|accuracy|percent(age)?)\b|%/i.test(column);
const isPeak = (column: string) => /\b(max|maximum|top|highest|fastest|longest)\b/i.test(column);
const isMean = (column: string) => /\b(average|avg|mean|per)\b/i.test(column);

/** True when a column can be added up, averaged per game, and scaled per 60. */
export function isCountColumn(column: string) {
  return !isRate(column) && !isPeak(column) && !isMean(column);
}

/** Reads 54, "54", "54:30" (mm:ss) or "1:02:30" (h:mm:ss) as minutes. */
export function toMinutes(value: CellValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
  return null;
}

function mean(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Combines stat lines into one, by what each column means. Counts add up, peaks
 * take the highest, averages take the mean. "X success rate" is recalculated from
 * "X successful" and "X" when both exist, because averaging percentages would
 * weigh a 2-pass game the same as a 40-pass game.
 */
export function combineStats(lines: StatLine[]): Record<string, number> {
  const valuesByColumn = new Map<string, number[]>();
  for (const line of lines) {
    for (const [column, raw] of Object.entries(line)) {
      if (isIdentityColumn(column)) continue;
      const value = isMinutesColumn(column) ? toMinutes(raw) : raw;
      if (typeof value !== "number") continue;
      const values = valuesByColumn.get(column) ?? [];
      values.push(value);
      valuesByColumn.set(column, values);
    }
  }

  const combined: Record<string, number> = {};
  const totalsByLowerName = new Map<string, number>();
  for (const [column, values] of valuesByColumn) {
    if (!isCountColumn(column)) continue;
    const total = values.reduce((sum, value) => sum + value, 0);
    combined[column] = total;
    totalsByLowerName.set(column.toLowerCase(), total);
  }

  for (const [column, values] of valuesByColumn) {
    if (isCountColumn(column)) continue;
    if (isPeak(column)) {
      combined[column] = Math.max(...values);
    } else if (isRate(column)) {
      const base = column.replace(/\s*success rate$/i, "").toLowerCase();
      const successful = totalsByLowerName.get(`${base} successful`);
      const attempts = totalsByLowerName.get(base);
      combined[column] =
        successful !== undefined && attempts ? (successful / attempts) * 100 : mean(values);
    } else {
      combined[column] = mean(values);
    }
  }
  return combined;
}

/** Adds to an existing column regardless of case, or starts a new one. */
export function addToColumn(stats: Record<string, number>, column: string, amount: number) {
  const existing = Object.keys(stats).find(
    (other) => other.toLowerCase() === column.toLowerCase(),
  );
  const key = existing ?? column;
  stats[key] = (stats[key] ?? 0) + amount;
}

// ---- Dashboard ---------------------------------------------------------------

export type DashboardTeam = { id: string; name: string };
export type DashboardPlayer = {
  id: string;
  team_id: string;
  name: string;
  default_jersey: number;
  position: string | null;
};
export type DashboardGame = {
  id: string;
  team_id: string;
  game_label: string;
  game_date: string;
  opponent: string | null;
  team_stats: Record<string, { text?: string; values?: number[] }> | null;
};
export type DashboardStatRow = { game_id: string; player_id: string; stats: StatLine };
export type DashboardCorrection = {
  game_id: string;
  player_id: string | null;
  event_type: string;
  value: number | null;
};
export type DashboardData = {
  teams: DashboardTeam[];
  players: DashboardPlayer[];
  games: DashboardGame[];
  stats: DashboardStatRow[];
  corrections: DashboardCorrection[];
};

export type PlayerSummary = {
  id: string;
  name: string;
  jersey: number;
  position: string | null;
  gamesPlayed: number;
  minutes: number | null;
  totals: Record<string, number>;
};
export type GameSummary = { game: DashboardGame; totals: Record<string, number> };
export type TeamSummary = {
  games: GameSummary[];
  players: PlayerSummary[];
  metrics: string[];
  totals: Record<string, number>;
  hasMinutes: boolean;
};

export type MetricMode = "total" | "average" | "per60";

const EVENT_COLUMNS: Record<string, string> = { goal: "Goals", shot: "Shots" };

// Listed first when present, in this order.
const PREFERRED_METRICS = [
  "Goals",
  "Assists",
  "Shots",
  "Passes",
  "Passes success rate",
  "Dribbles",
  "Duels",
  "Interceptions",
  "Loose ball recoveries",
  "Saves",
];

function preferredRank(metric: string) {
  const rank = PREFERRED_METRICS.findIndex(
    (preferred) => preferred.toLowerCase() === metric.toLowerCase(),
  );
  return rank === -1 ? PREFERRED_METRICS.length : rank;
}

function applyCorrections(totals: Record<string, number>, corrections: DashboardCorrection[]) {
  for (const correction of corrections) {
    const column = EVENT_COLUMNS[correction.event_type];
    if (column) addToColumn(totals, column, correction.value ?? 1);
  }
}

function minutesIn(totals: Record<string, number>) {
  const column = Object.keys(totals).find(isMinutesColumn);
  return column === undefined ? null : totals[column];
}

export function summarizeTeam(data: DashboardData, teamId: string): TeamSummary {
  const games = data.games
    .filter((game) => game.team_id === teamId)
    .sort((a, b) => a.game_date.localeCompare(b.game_date));
  const gameIds = new Set(games.map((game) => game.id));
  const stats = data.stats.filter((row) => gameIds.has(row.game_id));
  const corrections = data.corrections.filter((row) => gameIds.has(row.game_id));

  const players = data.players
    .filter((player) => player.team_id === teamId)
    .map((player): PlayerSummary => {
      const own = stats.filter((row) => row.player_id === player.id);
      const ownCorrections = corrections.filter((row) => row.player_id === player.id);
      const totals = combineStats(own.map((row) => row.stats));
      applyCorrections(totals, ownCorrections);
      return {
        id: player.id,
        name: player.name,
        jersey: player.default_jersey,
        position: player.position,
        gamesPlayed: new Set([...own, ...ownCorrections].map((row) => row.game_id)).size,
        minutes: minutesIn(totals),
        totals,
      };
    })
    .sort((a, b) => a.jersey - b.jersey);

  const gameSummaries = games.map((game): GameSummary => {
    const totals = combineStats(
      stats.filter((row) => row.game_id === game.id).map((row) => row.stats),
    );
    applyCorrections(
      totals,
      corrections.filter((row) => row.game_id === game.id && row.player_id !== null),
    );
    return { game, totals };
  });

  const teamTotals = combineStats(stats.map((row) => row.stats));
  applyCorrections(
    teamTotals,
    corrections.filter((row) => row.player_id !== null),
  );

  const metrics = Object.keys(teamTotals)
    .filter((metric) => !isMinutesColumn(metric))
    .sort((a, b) => preferredRank(a) - preferredRank(b) || a.localeCompare(b));

  return {
    games: gameSummaries,
    players,
    metrics,
    totals: teamTotals,
    hasMinutes: players.some((player) => player.minutes !== null && player.minutes > 0),
  };
}

/**
 * A player's value for a metric. Rates and peaks have no per-game or per-60 form,
 * so they stay as they are. Returns null when there's nothing to base it on, such
 * as per-60 for a player with no recorded minutes.
 */
export function metricValue(player: PlayerSummary, metric: string, mode: MetricMode) {
  const total = player.totals[metric];
  if (total === undefined) return null;
  if (mode === "total" || !isCountColumn(metric)) return total;
  if (mode === "average") return player.gamesPlayed > 0 ? total / player.gamesPlayed : null;
  return player.minutes ? (total / player.minutes) * 60 : null;
}

/** Whole numbers stay whole; everything else gets one decimal. */
export function formatStat(value: number | null, metric = "") {
  if (value === null) return "—";
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return isRate(metric) ? `${text}%` : text;
}
