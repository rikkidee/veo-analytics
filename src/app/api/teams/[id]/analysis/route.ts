import { buildTeamModel } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";
import { generateTeamAnalysis, generationFailure, teamAnalysisHtml } from "@/lib/scouting";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Generates and saves a team's season analysis. Stats are read here rather than
 * sent by the browser, and row level security limits them to the user's own teams.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return fail(401, "Sign in again to generate the analysis.");
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(503, "AI analysis isn't set up yet. Add ANTHROPIC_API_KEY to the app's environment variables.");
  }

  const body: unknown = await request.json().catch(() => null);
  const onlyIfMissing = (body as { onlyIfMissing?: boolean } | null)?.onlyIfMissing === true;

  const { id } = await params;
  const supabase = await createClient();
  const data = await loadDashboardData(supabase);
  const saved = data.teams.find((team) => team.id === id);
  if (!saved) return fail(404, "Team not found.");

  // Checked first, as finding out on save would pay for an analysis that can't be kept.
  if (!("team_analysis" in saved)) {
    return fail(500, "The database needs an update. Run supabase/add-team-analysis.sql in the Supabase SQL Editor, then reload.");
  }
  // Automatic runs never replace an existing analysis.
  if (onlyIfMissing && saved.team_analysis) return Response.json({ team_analysis: saved.team_analysis });

  const team = buildTeamModel(data, id);
  if (team.players.length === 0) return fail(400, "This team has no saved stats yet.");
  if (!team.hasMinutes) return fail(400, "The analysis uses per 60 stats, and this team's games have no minutes saved.");

  let teamAnalysis;
  try {
    teamAnalysis = teamAnalysisHtml(await generateTeamAnalysis(team), team);
  } catch (cause) {
    const failure = generationFailure(cause);
    if (failure) return failure;
    throw cause;
  }

  const { error } = await supabase.from("teams").update({ team_analysis: teamAnalysis }).eq("id", id);
  if (error) return fail(500, "The analysis was written but couldn't be saved. Try again.");
  return Response.json({ team_analysis: teamAnalysis });
}
