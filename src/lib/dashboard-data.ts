import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardCorrection,
  DashboardData,
  DashboardGame,
  DashboardPlayer,
  DashboardStatRow,
  DashboardTeam,
} from "@/lib/stats";

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
