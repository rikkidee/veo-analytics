import Anthropic from "@anthropic-ai/sdk";
import { buildTeamModel } from "@/lib/dashboard";
import { loadDashboardData } from "@/lib/dashboard-data";
import { generateScoutingReport, ReportRefusedError, reportColumns } from "@/lib/scouting";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

const MAX_NOTES_LENGTH = 2000;

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
  const rawNotes = (body as { coachNotes?: unknown } | null)?.coachNotes ?? "";
  if (typeof rawNotes !== "string") return fail(400, "Coach notes need to be text.");
  const coachNotes = rawNotes.trim();
  if (coachNotes.length > MAX_NOTES_LENGTH) {
    return fail(400, `Coach notes can be up to ${MAX_NOTES_LENGTH} characters.`);
  }

  const { id } = await params;
  const supabase = await createClient();
  const data = await loadDashboardData(supabase);
  const teamId = data.players.find((player) => player.id === id)?.team_id;
  if (!teamId) return fail(404, "Player not found.");

  const team = buildTeamModel(data, teamId);
  const player = team.players.find((other) => other.id === id);
  if (!player) return fail(400, "This player has no saved stats yet.");
  if (!team.hasMinutes) return fail(400, "Reports use per 60 stats, and this team's games have no minutes saved.");

  let columns;
  try {
    columns = reportColumns(await generateScoutingReport(player, team, coachNotes), coachNotes);
  } catch (cause) {
    if (cause instanceof ReportRefusedError) return fail(502, "A report couldn't be written for this player. Try changing the coach notes.");
    if (cause instanceof Anthropic.AuthenticationError) return fail(503, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
    if (cause instanceof Anthropic.RateLimitError) return fail(429, "Too many reports at once. Wait a minute and try again.");
    if (cause instanceof Anthropic.APIError) return fail(502, "The AI service had a problem. Try again in a moment.");
    throw cause;
  }

  const { error } = await supabase.from("players").update(columns).eq("id", id);
  if (error) {
    // PGRST204 and 42703: a column the app needs is missing.
    const missingColumn = error.code === "PGRST204" || error.code === "42703";
    return fail(
      500,
      missingColumn
        ? "The database needs an update. Run supabase/add-ai-scouting-reports.sql in the Supabase SQL Editor, then try again."
        : "The report was written but couldn't be saved. Try again.",
    );
  }
  return Response.json(columns);
}
