import { buildTeamModel } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";
import { generateScoutingReport, generationFailure, reportColumns } from "@/lib/scouting";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const MAX_NOTES_LENGTH = 2000;
const MISSING_COLUMN =
  "The database needs an update. Run supabase/add-ai-scouting-reports.sql in the Supabase SQL Editor, then try again.";

const fail = (status: number, error: string) => Response.json({ error }, { status });

/**
 * Generates and saves a player's scouting report. Stats are read here rather than
 * sent by the browser, and row level security limits them to the user's own teams.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return fail(401, "Sign in again to generate a report.");
  if (!process.env.ANTHROPIC_API_KEY) {
    return fail(503, "AI reports aren't set up yet. Add ANTHROPIC_API_KEY to the app's environment variables.");
  }

  const body: unknown = await request.json().catch(() => null);
  const { coachNotes: rawNotes = "", onlyIfMissing = false } = (body ?? {}) as {
    coachNotes?: unknown;
    onlyIfMissing?: boolean;
  };
  if (typeof rawNotes !== "string") return fail(400, "Coach notes need to be text.");
  const coachNotes = rawNotes.trim();
  if (coachNotes.length > MAX_NOTES_LENGTH) {
    return fail(400, `Coach notes can be up to ${MAX_NOTES_LENGTH} characters.`);
  }

  const { id } = await params;
  const supabase = await createClient();
  const data = await loadDashboardData(supabase);
  const saved = data.players.find((player) => player.id === id);
  if (!saved) return fail(404, "Player not found.");
  const teamId = saved.team_id;

  // Checked first, as finding out on save would pay for a report that can't be kept.
  if (!("coach_notes" in saved)) return fail(500, MISSING_COLUMN);

  // Automatic runs never replace a report, including ones written by hand.
  if (onlyIfMissing && (saved.nickname || saved.scouting_report || saved.strengths || saved.areas_to_develop)) {
    return Response.json({
      nickname: saved.nickname,
      scouting_report: saved.scouting_report,
      strengths: saved.strengths,
      areas_to_develop: saved.areas_to_develop,
    });
  }

  const team = buildTeamModel(data, teamId);
  const player = team.players.find((other) => other.id === id);
  if (!player) return fail(400, "This player has no saved stats yet.");
  if (!team.hasMinutes) return fail(400, "Reports use per 60 stats, and this team's games have no minutes saved.");

  let columns;
  try {
    columns = reportColumns(await generateScoutingReport(player, team, coachNotes), coachNotes);
  } catch (cause) {
    const failure = generationFailure(cause);
    if (failure) return failure;
    throw cause;
  }

  const { error } = await supabase.from("players").update(columns).eq("id", id);
  if (error) return fail(500, "The report was written but couldn't be saved. Try again.");
  return Response.json(columns);
}
