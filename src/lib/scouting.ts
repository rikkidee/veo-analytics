import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { comparisonPlayers, KM_PER_MILE, type PlayerModel, type TeamModel } from "@/lib/dashboard";

const ReportSchema = z.object({
  nickname: z.string(),
  blurb: z.string(),
  strengths: z.string(),
  develop: z.string(),
});
export type ScoutingReport = z.infer<typeof ReportSchema>;

const COMPARED_STATS = [
  "Goals", "Shots", "Passes", "Passes successful", "Tackles", "Duels", "Interceptions",
  "Dribbles", "Loose ball recoveries", "Sprints", "High-intensity runs",
];

// The examples are invented. The real reports name children, and this repo is public.
const SYSTEM_PROMPT = `You write short scouting reports for a youth soccer coach's season dashboard. The players are children, around 12 and 13 years old. The coach reads these to decide how to develop each player and use them on the field.

Each report has four parts:
- nickname: two or three words starting with "The", capturing how this player plays. It should be something a kid would be proud of.
- blurb: one punchy line, under 20 words, that sums up the player.
- strengths: two to four short sentences. Lead with the numbers that actually stand out, written like "5.0 interceptions/60 (2nd on team)".
- develop: two to three short sentences on what to work on next, specific enough to act on in training.

Here is the voice to match:

nickname: The Metronome
blurb: Keeps the team ticking with calm, tidy passing under pressure.
strengths: 31.2 passes/60 and the best pass accuracy among regulars at 46%. Rarely gives the ball away. Reads the next pass early and always offers an option.
develop: Could take on defenders more often instead of always playing the safe ball. Shooting from distance is an untapped weapon. Getting forward late into the box would add goals.

nickname: The Motor
blurb: Covers every blade of grass and wins the ball back all game.
strengths: 14.8 duels/60 and 6.1 tackles/60, both top 3 on the team. High-intensity running well above average. Sets the tone without the ball.
develop: Passing after winning the ball is the next step, at 27% against a 34% team average. Taking an extra touch to look up would keep more attacks alive.

Rules:
- Base every claim on the stats you're given, and only quote numbers that appear in them. Don't invent events, games or skills the data can't show.
- Treat the coach's notes as true, and let them change how you read the numbers. If a player spends time in goal, low outfield minutes aren't a stamina problem.
- A stat that's low can be explained by position, so read the whole profile before calling something a weakness.
- Be honest about what needs work, while keeping it constructive and about soccer. Never comment on bodies, appearance, personality flaws or anything off the field.
- You aren't given the player's name, so don't use one. Write in fragments where you can and avoid pronouns, as in the examples.
- Write plain text with no markdown or HTML.`;

function describePlayer(player: PlayerModel, team: TeamModel, coachNotes: string) {
  const compared = comparisonPlayers(team.players);
  const stats = COMPARED_STATS.filter((stat) => compared.some((other) => stat in other.totals)).map((stat) => {
    const values = compared.map((other) => other.per60[stat] ?? 0);
    const own = player.per60[stat] ?? 0;
    return {
      stat,
      player_per_60: own,
      team_average_per_60: Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10,
      team_best_per_60: Math.max(...values),
      rank: `${values.filter((value) => value > own).length + 1} of ${compared.length}`,
    };
  });

  const accuracy = (other: PlayerModel) =>
    (other.totals.Passes ?? 0) > 0 ? Math.round(((other.totals["Passes successful"] ?? 0) / other.totals.Passes) * 100) : 0;

  // No name, jersey or scouting history: the numbers are all the report needs,
  // and these are children, so nothing identifying leaves the app unless a coach writes it.
  return JSON.stringify(
    {
      games_played: player.gamesPlayed,
      minutes_played: Math.round(player.totals["Minutes tracked"] ?? 0),
      season_totals: { goals: player.totals.Goals ?? 0, shots: player.totals.Shots ?? 0 },
      pass_accuracy_percent: accuracy(player),
      team_average_pass_accuracy_percent: Math.round(
        compared.reduce((sum, other) => sum + accuracy(other), 0) / compared.length,
      ),
      top_speed_kph: Math.round((player.totals["Top speed"] ?? 0) * KM_PER_MILE * 10) / 10,
      stats_per_60_minutes: stats,
      coach_notes: coachNotes || "None",
    },
    null,
    2,
  );
}

export class ReportRefusedError extends Error {}

export async function generateScoutingReport(
  player: PlayerModel,
  team: TeamModel,
  coachNotes: string,
): Promise<ScoutingReport> {
  const response = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReportSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: describePlayer(player, team, coachNotes) }],
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) throw new ReportRefusedError();
  return response.parsed_output;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The fields as saved on a player. Saved text is shown as formatted text, so it's escaped here. */
export function reportColumns(report: ScoutingReport, coachNotes: string) {
  return {
    nickname: report.nickname.trim(),
    scouting_report: `<strong>${escapeHtml(report.blurb.trim())}</strong>`,
    strengths: escapeHtml(report.strengths.trim()),
    areas_to_develop: escapeHtml(report.develop.trim()),
    coach_notes: coachNotes || null,
  };
}
