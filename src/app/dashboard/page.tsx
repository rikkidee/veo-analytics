import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import Dashboard from "@/components/Dashboard";
import type {
  DashboardCorrection,
  DashboardData,
  DashboardGame,
  DashboardPlayer,
  DashboardStatRow,
  DashboardTeam,
} from "@/lib/stats";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Dashboard | Veo Analytics" };

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

async function loadDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const [teams, players, games, stats, corrections] = await Promise.all([
    fetchAll<DashboardTeam>((from, to) =>
      supabase.from("teams").select("id, name").order("created_at", { ascending: false }).range(from, to),
    ),
    fetchAll<DashboardPlayer>((from, to) =>
      supabase.from("players").select("id, team_id, name, default_jersey, position").order("id").range(from, to),
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

async function SignedInDashboard() {
  if (!(await getCurrentUser())) redirect("/auth");

  let data: DashboardData;
  try {
    data = await loadDashboardData();
  } catch (cause) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        Could not load the dashboard: {(cause as Error).message}
      </p>
    );
  }

  if (data.teams.length === 0) {
    return (
      <p>
        Add your team first.{" "}
        <Link href="/onboarding" className="font-medium text-emerald-700 underline dark:text-emerald-400">
          Set up your roster
        </Link>
      </p>
    );
  }
  return <Dashboard data={data} />;
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="h-64" aria-busy="true" />}>
      <SignedInDashboard />
    </Suspense>
  );
}
