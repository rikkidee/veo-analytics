import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { cleanNickname, comparisonPlayers, KM_PER_MILE, type PlayerModel, type TeamModel } from "@/lib/dashboard";

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
- nickname: two or three words starting with "The", capturing how this player plays. It should be something a kid would be proud of. It has to be different from every name in nicknames_used_by_teammates, and from the nicknames in the examples below.
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
- The nickname appears once, in its own field, so don't repeat it in the blurb, strengths or develop.
- Write plain text with no markdown or HTML.`;

function describePlayer(player: PlayerModel, team: TeamModel, coachNotes: string, takenNicknames: string[]) {
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
      nicknames_used_by_teammates: takenNicknames,
    },
    null,
    2,
  );
}

export class ReportRefusedError extends Error {}

async function askClaude<Schema extends z.ZodType>(schema: Schema, system: string, content: string) {
  const response = await new Anthropic().beta.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new ReportRefusedError();
  return response.parsed_output as z.infer<Schema>;
}

const sameNickname = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

/** Writes a report, trying once more if it comes back with a teammate's nickname. */
export async function generateScoutingReport(player: PlayerModel, team: TeamModel, coachNotes: string) {
  const taken = team.players.flatMap((other) => (other.id !== player.id && other.nickname ? [other.nickname] : []));
  const ask = (nicknames: string[]) =>
    askClaude(ReportSchema, SYSTEM_PROMPT, describePlayer(player, team, coachNotes, nicknames));

  const report = await ask(taken);
  const nickname = cleanNickname(report.nickname);
  const clashes = taken.some((other) => sameNickname(nickname, other));
  return clashes ? ask(taken) : report;
}

/** Turns a failed generation into the response to send, or null if it's not one we expect. */
export function generationFailure(cause: unknown) {
  const fail = (status: number, error: string) => Response.json({ error }, { status });
  if (cause instanceof ReportRefusedError) return fail(502, "The AI couldn't write this one. Try again, or change the coach notes.");
  if (cause instanceof Anthropic.AuthenticationError) return fail(503, "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
  if (cause instanceof Anthropic.RateLimitError) return fail(429, "Too many requests to the AI at once. Reload the page in a minute to carry on.");
  if (cause instanceof Anthropic.APIError) return fail(502, "The AI service had a problem. Try again in a moment.");
  return null;
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The fields as saved on a player. Saved text is shown as formatted text, so it's escaped here. */
export function reportColumns(report: ScoutingReport, coachNotes: string) {
  return {
    nickname: cleanNickname(report.nickname),
    scouting_report: `<strong>${escapeHtml(report.blurb.trim())}</strong>`,
    strengths: escapeHtml(report.strengths.trim()),
    areas_to_develop: escapeHtml(report.develop.trim()),
    coach_notes: coachNotes || null,
  };
}

const SectionSchema = z.object({
  headline: z.string(),
  paragraphs: z.array(z.string()),
});
const TeamAnalysisSchema = z.object({
  strengths: SectionSchema,
  develop: SectionSchema,
  tactics: SectionSchema,
  trends: SectionSchema,
});

// The example is invented. The real write-ups name children, and this repo is public.
const TEAM_SYSTEM_PROMPT = `You write the season analysis on a youth soccer coach's dashboard. The players are children, around 12 and 13 years old. The coach uses it to plan training and decide how to set up the team.

Write four sections:
- strengths: what this team does well, overall.
- develop: the biggest opportunities to improve, most valuable first.
- tactics: observations the coach can act on, such as which players' numbers suit which roles, who complements whom, and how to use players whose minutes are limited.
- trends: how the team has changed across the season, comparing early games with recent ones.

Each section has a headline, one short bold sentence that states the main point, and one to three paragraphs of two to four sentences each.

Here is the voice to match:

headline: Passing accuracy is the single biggest opportunity.
paragraph: The team completes 34% of passes, so two of every three don't reach a teammate. [P4] at 46% and [P9] at 43% show what retaining the ball does for sustained attacks. Pushing the team towards 40% would reduce the defensive workload as well as creating more chances.

Rules:
- Base every claim on the stats you're given, and only quote numbers that appear in them or follow directly from them. Don't invent events, opponents or skills the data can't show.
- Refer to individual players only with their reference, exactly as given, such as [P4]. Don't guess at names.
- Treat each player's coach notes as true, and let them change how you read that player's numbers.
- Treat coach_context as true, and let it change how you read the team's numbers. If it names a child, refer to that child only as "one player" or by their reference if it's clear which one, never by name.
- Players marked low_minutes have rates based on very little time, so don't draw conclusions from them.
- With fewer than three games, say that it's too early to call a trend rather than stretching the data.
- Be honest about weaknesses, while keeping it constructive and about soccer. Never comment on bodies, appearance, personality flaws or anything off the field.
- Write plain text with no markdown or HTML, apart from the player references.`;

/** Players go out as [P1], [P2]..., so names and jerseys stay here. See insertPlayers. */
function describeTeam(team: TeamModel, coachContext: string) {
  const compared = new Set(comparisonPlayers(team.players));
  const passAccuracy = (passes: number, successful: number) =>
    passes > 0 ? Math.round((successful / passes) * 100) : 0;

  return JSON.stringify(
    {
      coach_context: coachContext || "None",
      games: team.games.map((game) => {
        const sum = (stat: string) =>
          Math.round(team.players.reduce((total, player) => total + (player.perGame.get(game.label)?.[stat] ?? 0), 0));
        const teamStats = Object.fromEntries(
          Object.entries(game.stats).map(([stat, { own, opp }]) => [stat, { this_team: own, opponent: opp }]),
        );
        return {
          game: game.label,
          date: game.date,
          ...teamStats,
          tackles: sum("Tackles"),
          duels: sum("Duels"),
          interceptions: sum("Interceptions"),
          loose_ball_recoveries: sum("Loose ball recoveries"),
        };
      }),
      players: team.players.map((player, index) => ({
        reference: `[P${index + 1}]`,
        games_played: player.gamesPlayed,
        minutes_played: Math.round(player.totals["Minutes tracked"] ?? 0),
        low_minutes: !compared.has(player),
        pass_accuracy_percent: passAccuracy(player.totals.Passes ?? 0, player.totals["Passes successful"] ?? 0),
        goals: player.totals.Goals ?? 0,
        per_60_minutes: Object.fromEntries(COMPARED_STATS.map((stat) => [stat, player.per60[stat] ?? 0])),
        coach_notes: player.coachNotes ?? undefined,
      })),
    },
    null,
    2,
  );
}

export function generateTeamAnalysis(team: TeamModel, coachContext: string) {
  return askClaude(TeamAnalysisSchema, TEAM_SYSTEM_PROMPT, describeTeam(team, coachContext));
}

// Inline styles match the static dashboard's Analysis tab.
const PARAGRAPH_STYLE = "color:#c9d1d9;line-height:1.8;font-size:15px;margin-bottom:16px";

const TEAM_SECTIONS = [
  { key: "strengths", title: "Team Strengths", color: "#3fb950" },
  { key: "develop", title: "Areas to Develop", color: "#f0883e" },
  { key: "tactics", title: "Tactical Observations", color: "#58a6ff" },
  { key: "trends", title: "Season Trends", color: "#d2a8ff" },
] as const;

/** The saved form of an analysis, with each [P1] swapped for that player's jersey and name. */
export function teamAnalysisHtml(analysis: z.infer<typeof TeamAnalysisSchema>, team: TeamModel) {
  const insertPlayers = (text: string) =>
    escapeHtml(text.trim()).replace(/\[P(\d+)\]/g, (_, number) => {
      const player = team.players[Number(number) - 1];
      return player ? `<strong>#${player.jersey} ${escapeHtml(player.name)}</strong>` : "one player";
    });

  return TEAM_SECTIONS.map(({ key, title, color }) => {
    const { headline, paragraphs } = analysis[key];
    const body = [
      `<p style="${PARAGRAPH_STYLE}"><strong style="color:${color}">${insertPlayers(headline)}</strong></p>`,
      ...paragraphs.map((paragraph) => `<p style="${PARAGRAPH_STYLE}">${insertPlayers(paragraph)}</p>`),
    ].join("");
    return `<div class="section-title">${title}</div><div class="chart-container" style="margin-bottom:24px">${body}</div>`;
  }).join("");
}
