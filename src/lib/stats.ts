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

/**
 * Reads 40, "40", "40min", "40 mins", "40'", "40:00" (mm:ss), "1:02:30" (h:mm:ss)
 * or "1h 2m" as minutes. chrome-extension/content.js has a copy of this, as the
 * extension can't import from the app.
 */
export function toMinutes(value: CellValue): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const text = value.trim();

  const plain = text.match(/^(\d+(?:\.\d+)?)\s*(?:m|mins?|minutes?|['’])?$/i);
  if (plain) return Number(plain[1]);

  const clock = text.match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/);
  if (clock) return Number(clock[1] ?? 0) * 60 + Number(clock[2]) + Number(clock[3]) / 60;

  const hours = text.match(/^(\d+)\s*h(?:rs?|ours?)?(?:\s*(\d+)\s*m(?:ins?|inutes?)?)?$/i);
  return hours ? Number(hours[1]) * 60 + Number(hours[2] ?? 0) : null;
}

/** Reads 6.8, "6.8", "1,204" or "6.8 mi". The scraper keeps anything with a unit as text. */
function leadingNumber(value: CellValue) {
  if (typeof value === "number") return value;
  const match = value?.trim().match(/^-?\d[\d,]*(?:\.\d+)?/);
  return match ? Number(match[0].replace(/,/g, "")) : null;
}

const KM_PER_MILE = 1.60934;

/**
 * A cell as a number, or null when it isn't one. Minutes come out in minutes, and
 * distances and speeds in miles, as Veo's reports show them, unless marked metric.
 */
export function readStat(column: string, value: CellValue) {
  if (isMinutesColumn(column)) return toMinutes(value) ?? leadingNumber(value);
  const number = leadingNumber(value);
  if (number === null) return null;
  const metric = /^(distance|top speed)/i.test(column.trim()) && typeof value === "string" && /\d\s*(?:km|kph|kilomet)/i.test(value);
  return metric ? number / KM_PER_MILE : number;
}

const normalizeName = (name: string) => name.replace(/\s+/g, " ").trim().toLowerCase();

/** Roster entries for one person. Identical names on different jerseys are two people. */
export function isSamePerson(
  a: { name: string; jersey: number },
  b: { name: string; jersey: number },
) {
  if (normalizeName(a.name) !== normalizeName(b.name)) return false;
  return a.name.trim() !== b.name.trim() || a.jersey === b.jersey;
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
      const value = readStat(column, raw);
      if (value === null) continue;
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

// ---- Dashboard ---------------------------------------------------------------

export type DashboardTeam = {
  id: string;
  name: string;
  club?: string | null;
  age_group?: string | null;
  logo_url?: string | null;
  analysis?: string | null;
  team_analysis?: string | null;
  coach_context?: string | null;
};
export type DashboardPlayer = {
  id: string;
  team_id: string;
  name: string;
  default_jersey: number;
  position?: string | null;
  nickname?: string | null;
  scouting_report?: string | null;
  strengths?: string | null;
  areas_to_develop?: string | null;
  coach_notes?: string | null;
};
export type DashboardGame = {
  id: string;
  team_id: string;
  game_label: string;
  game_date: string;
  opponent: string | null;
  veo_url?: string | null;
  /** Veo's stat cards by label, plus "Score" from the report's header, which also has `teams`. */
  team_stats: Record<string, { text?: string; values?: number[]; teams?: string[] }> | null;
};
export type DashboardStatRow = { game_id: string; player_id: string; stats: StatLine };
export type DashboardCorrection = {
  game_id: string;
  player_id: string | null;
  event_type: string;
  value: number | null;
};
/** What's still unassigned in a saved game. Games saved before reports were kept aren't listed. */
export type GameCoverage = { matched: number; unassigned: number };

export type DashboardData = {
  coverage?: Record<string, GameCoverage>;
  teams: DashboardTeam[];
  players: DashboardPlayer[];
  games: DashboardGame[];
  stats: DashboardStatRow[];
  corrections: DashboardCorrection[];
};

/** A saved game as it's being mapped, shown ahead of the save reaching the database. */
export type GamePreview = {
  /** Identifies this version, to tell when it's the one that got saved. */
  version: string;
  saved: boolean;
  stats: { player_id: string; stats: StatLine }[];
  corrections: { player_id: string; event_type: string }[];
  coverage: GameCoverage;
  details: Pick<DashboardGame, "game_label" | "game_date" | "opponent">;
};

export function withPreviews(data: DashboardData, previews: Record<string, GamePreview>): DashboardData {
  const entries = Object.entries(previews);
  if (entries.length === 0) return data;
  const others = <T extends { game_id: string }>(rows: T[]) => rows.filter((row) => !previews[row.game_id]);
  return {
    ...data,
    games: data.games.map((game) => (previews[game.id] ? { ...game, ...previews[game.id].details } : game)),
    stats: [
      ...others(data.stats),
      ...entries.flatMap(([game_id, { stats }]) => stats.map((row) => ({ game_id, player_id: row.player_id, stats: row.stats }))),
    ],
    corrections: [
      ...others(data.corrections),
      ...entries.flatMap(([game_id, { corrections }]) => corrections.map((row) => ({ game_id, ...row, value: 1 }))),
    ],
    coverage: { ...data.coverage, ...Object.fromEntries(entries.map(([id, { coverage }]) => [id, coverage])) },
  };
}

export const EVENT_COLUMNS: Record<string, string> = { goal: "Goals", shot: "Shots" };
