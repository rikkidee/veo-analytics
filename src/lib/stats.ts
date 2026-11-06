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

// ---- Dashboard ---------------------------------------------------------------

export type DashboardTeam = {
  id: string;
  name: string;
  club?: string | null;
  logo_url?: string | null;
  analysis?: string | null;
  team_analysis?: string | null;
};
export type DashboardPlayer = {
  id: string;
  team_id: string;
  name: string;
  default_jersey: number;
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

export const EVENT_COLUMNS: Record<string, string> = { goal: "Goals", shot: "Shots" };
