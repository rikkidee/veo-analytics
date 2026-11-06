import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardCorrection,
  DashboardData,
  DashboardGame,
  DashboardPlayer,
  DashboardStatRow,
  DashboardTeam,
  GameCoverage,
} from "@/lib/stats";
import { detectedJerseys, type VeoPayload } from "@/lib/veo";

const PAGE_SIZE = 1000;

// Supabase returns at most 1000 rows per request by default, and a team's stat
// rows pass that within a season. Stopping there would silently undercount.
async function fetchAll<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
}

/**
 * How much of each saved game's jerseys have an answer. Read separately, as it's
 * extra information: without it the dashboard just doesn't offer mapping hints.
 */
export async function loadMappingCoverage(
  supabase: SupabaseClient,
): Promise<Record<string, GameCoverage>> {
  try {
    const [games, mappings] = await Promise.all([
      fetchAll<{ id: string; veo_payload: VeoPayload | null }>((from, to) =>
        supabase.from("games").select("id, veo_payload").order("id").range(from, to),
      ),
      fetchAll<{ game_id: string; detected_jersey: number }>((from, to) =>
        supabase.from("jersey_mappings").select("game_id, detected_jersey").order("id").range(from, to),
      ),
    ]);
    return Object.fromEntries(
      games.flatMap((game) => {
        if (!game.veo_payload) return [];
        const jerseys = detectedJerseys(game.veo_payload);
        const decided = new Set(
          mappings.filter((row) => row.game_id === game.id).map((row) => row.detected_jersey),
        );
        const matched = jerseys.filter((jersey) => decided.has(jersey)).length;
        return [[game.id, { matched, unassigned: jerseys.length - matched }]];
      }),
    );
  } catch {
    return {};
  }
}

/** Everything the signed-in user can see, as row level security limits it. */
export async function loadDashboardData(supabase: SupabaseClient): Promise<DashboardData> {
  const [teams, players, games, stats, corrections] = await Promise.all([
    fetchAll<DashboardTeam>((from, to) =>
      // "*" so the page still works if the optional content columns haven't been added yet.
      supabase.from("teams").select("*").order("created_at", { ascending: false }).range(from, to),
    ),
    fetchAll<DashboardPlayer>((from, to) =>
      supabase.from("players").select("*").order("id").range(from, to),
    ),
    fetchAll<DashboardGame>((from, to) =>
      supabase.from("games").select("id, team_id, game_label, game_date, opponent, team_stats").order("id").range(from, to),
    ),
    fetchAll<DashboardStatRow>((from, to) =>
      supabase.from("player_game_stats").select("game_id, player_id, stats").order("id").range(from, to),
    ),
    fetchAll<DashboardCorrection>((from, to) =>
      supabase.from("event_corrections").select("game_id, player_id, event_type, value").order("id").range(from, to),
    ),
  ]);
  return { teams, players, games, stats, corrections };
}
