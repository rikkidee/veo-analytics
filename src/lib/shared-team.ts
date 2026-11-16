import { createClient } from "@supabase/supabase-js";
import type { DashboardData, DashboardTeam } from "@/lib/stats";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

/** A team's link token: 32 random bytes, base64url encoded. ShareLink makes them. */
const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type SharedTeam = { data: DashboardData; teamId: string };

/**
 * One team's stats for its public link, or null if no team has that link. Read as
 * nobody in particular, whoever opens it, so it only ever gets what the link shares.
 */
export async function loadSharedTeam(token: string): Promise<SharedTeam | null> {
  if (!isSupabaseConfigured || !SHARE_TOKEN_PATTERN.test(token)) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.rpc("get_shared_team", { token });
  if (error) throw new Error(error.message);
  if (!data) return null;

  const { team, players, games, stats, corrections } = data as Omit<DashboardData, "teams"> & { team: DashboardTeam };
  return { teamId: team.id, data: { teams: [team], players, games, stats, corrections } };
}
