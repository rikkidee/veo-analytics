"use client";

import { useMemo, useState } from "react";
import { averagePerGame, comparisonPlayers, KM_PER_MILE, passAccuracy, type PlayerModel, type TeamModel } from "@/lib/dashboard";
import Chart, { baseOptions, easyHover, type ChartConfig } from "./Chart";
import { HighTrackingNotice, MinutesNotice, StatCard } from "./parts";
import type { SavedReport } from "./reports";
import ScoutingReport from "./ScoutingReport";

const SUMMARY_STATS = ["Goals", "Shots", "Passes successful", "Tackles", "Duels", "Interceptions", "Dribbles", "Loose ball recoveries", "High-intensity runs"];

const TIPS: Record<string, string> = {
  Goals: "Attempts on goal that resulted in a score",
  Shots: "Attempts on goal that did not result in a goal",
  Tackles: "Dispossessing an opponent by making physical contact to win the ball",
  Duels: "Any 1v1 contest between two opposing players for the ball",
  Interceptions: "Cutting out or intercepting a pass intended for an opponent",
  Dribbles: "Carrying the ball past an opposing player while maintaining possession",
  "Loose ball recoveries": "Gaining possession of a ball not controlled by either team",
  "High-intensity runs": "Sustained running above the high-speed threshold but below sprint speed",
  "Passes successful": "Passes that successfully reach a teammate",
  "Pass %": "Percentage of total passes that were successful",
};

const TREND_STATS: [string, string][] = [
  ["Passes", "Passes"], ["Tackles", "Tackles"], ["Goals", "Goals"], ["Duels", "Duels"],
  ["Interceptions", "Interceptions"], ["Dribbles", "Dribbles"], ["Sprints", "Sprints"], ["Shots", "Shots"],
  ["High-intensity runs", "High-intensity Runs"], ["Loose ball recoveries", "Ball Recoveries"], ["Minutes tracked", "Minutes"],
];

// Per 60 wherever that means something. Pass % and top speed are the same however long someone plays.
const RADAR_AXES: { label: string; unit: string; read: (player: PlayerModel) => number }[] = [
  { label: "Goals", unit: "/60", read: (player) => player.per60.Goals ?? 0 },
  { label: "Passes", unit: "/60", read: (player) => player.per60.Passes ?? 0 },
  { label: "Pass %", unit: "%", read: passAccuracy },
  { label: "Shots", unit: "/60", read: (player) => player.per60.Shots ?? 0 },
  { label: "Sprints", unit: "/60", read: (player) => player.per60.Sprints ?? 0 },
  { label: "Interceptions", unit: "/60", read: (player) => player.per60.Interceptions ?? 0 },
  { label: "Dribbles", unit: "/60", read: (player) => player.per60.Dribbles ?? 0 },
  { label: "Duels + Tackles", unit: "/60", read: (player) => (player.per60.Duels ?? 0) + (player.per60.Tackles ?? 0) },
  { label: "Top speed", unit: " kph", read: (player) => (player.totals["Top speed"] ?? 0) * KM_PER_MILE },
  { label: "km", unit: "/60", read: (player) => (player.per60["Distance tracked"] ?? 0) * KM_PER_MILE },
];

type Mode = "total" | "perGame" | "per60";
const MODES: [Mode, string][] = [["total", "Season Total"], ["perGame", "Per Game"], ["per60", "Per 60 Min"]];

const COLUMN_TIPS: Record<string, string> = {
  Goals: "Attempts resulting in a score",
  Shots: "Attempts that did not result in a goal",
  "Pass Succ": "Passes that reach a teammate",
  "Pass %": "Percentage of passes that were successful",
  Tackles: "Dispossessing an opponent with physical contact",
  Duels: "1v1 contests for the ball",
  Int: "Cutting out a pass intended for an opponent",
  Dribbles: "Carrying past an opponent while keeping possession",
  Recoveries: "Gaining possession of an uncontrolled ball",
  "HI Runs": "Sustained running above high-speed threshold",
  Sprints: "Running at or above sprint speed threshold",
};

const LOG_COLUMNS: [string, string | null][] = [
  ["Min", "Minutes tracked"], ["Goals", "Goals"], ["Shots", "Shots"], ["Pass Succ", "Passes successful"],
  ["Pass %", "Pass %"], ["Tackles", "Tackles"], ["Duels", "Duels"], ["Int", "Interceptions"], ["Dribbles", "Dribbles"],
  ["Recoveries", "Loose ball recoveries"], ["HI Runs", "High-intensity runs"], ["Sprints", "Sprints"],
  ["Top Spd (kph)", "Top speed"], ["KM", "Distance tracked"],
];

export default function PlayersTab({
  team,
  reports,
}: {
  team: TeamModel;
  reports: Record<string, SavedReport>;
}) {
  const { players, games } = team;
  const [pickedId, setPickedId] = useState(players[0]?.id);
  const [mode, setMode] = useState<Mode>("total");
  const [trendStat, setTrendStat] = useState("Passes");
  const player = players.find((other) => other.id === pickedId) ?? players[0];

  const trend = useMemo<ChartConfig | null>(() => {
    if (!player) return null;
    const values = games.map((game) => {
      const line = player.perGame.get(game.label);
      return line ? (line[trendStat] ?? 0) : null;
    });
    return {
      type: "line",
      data: {
        labels: games.map((game) => game.label),
        datasets: [
          {
            label: `${player.name} - ${trendStat}`,
            data: values,
            borderColor: "#58a6ff",
            backgroundColor: "rgba(88,166,255,.1)",
            fill: true,
            tension: 0.3,
            spanGaps: true,
            pointRadius: 5,
            pointBackgroundColor: values.map((value) => (value === null ? "transparent" : "#58a6ff")),
          },
        ],
      },
      options: baseOptions,
    };
  }, [player, games, trendStat]);

  const radar = useMemo<ChartConfig | null>(() => {
    if (!player) return null;
    // Otherwise a low-minutes rate would shrink everyone else's chart to almost nothing.
    const scalePlayers = comparisonPlayers(players);
    const rows = RADAR_AXES.map(({ unit, read }) => {
      const values = scalePlayers.map(read);
      const best = Math.max(...values, 1);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const own = read(player);
      return { own, average, unit, ownScore: Math.min((own / best) * 100, 100), averageScore: (average / best) * 100 };
    });
    return {
      type: "radar",
      data: {
        labels: RADAR_AXES.map(({ label, unit }) => (unit === "/60" ? `${label}/60` : label)),
        datasets: [
          {
            label: player.name,
            data: rows.map((row) => Math.round(row.ownScore)),
            borderColor: "#1f6feb",
            backgroundColor: "rgba(31,111,235,.2)",
            pointBackgroundColor: "#1f6feb",
          },
          {
            label: "Team average",
            data: rows.map((row) => Math.round(row.averageScore)),
            borderColor: "#f0883e",
            backgroundColor: "transparent",
            pointBackgroundColor: "#f0883e",
            borderDash: [6, 4],
          },
        ],
      },
      options: {
        responsive: true,
        // Spokes point every way, so "x" alone would pick the wrong one.
        ...easyHover("xy"),
        scales: {
          r: {
            grid: { color: "#30363d" },
            ticks: { display: false },
            pointLabels: { color: "#c9d1d9", font: { size: 11 } },
            min: 0,
            max: 100,
          },
        },
        plugins: {
          legend: { labels: { color: "#c9d1d9" } },
          tooltip: {
            callbacks: {
              // The plotted scores are relative to the team's best, so show the real rate.
              label: (item) => {
                const row = rows[item.dataIndex];
                const value = item.datasetIndex === 0 ? row.own : row.average;
                return `${item.dataset.label}: ${value.toFixed(1)}${row.unit}`;
              },
            },
          },
        },
      },
    };
  }, [player, players]);

  if (!player || !trend || !radar) {
    return <p className="muted">No player stats have been saved for this team yet.</p>;
  }

  // Goals are a season count in Per Game too, as 0.3 of a goal per game reads oddly.
  const statValue = (stat: string) =>
    mode === "per60"
      ? (player.per60[stat] ?? 0)
      : mode === "perGame" && stat !== "Goals"
        ? averagePerGame(player, stat)
        : (player.totals[stat] ?? 0);
  const statLabel = (stat: string) =>
    mode === "per60" ? `${stat} /60min` : mode === "perGame" && stat !== "Goals" ? `${stat} /game` : `${stat} total`;
  const highTrackingGames = games.filter((game) => game.trackingLooksHigh && player.perGame.has(game.label));

  return (
    <>
      <div className="section-title">Select Player</div>
      <div>
        {players.map((other) => (
          <button
            key={other.id}
            type="button"
            aria-pressed={other.id === player.id}
            className={`player-card ${other.id === player.id ? "selected" : ""}`}
            onClick={() => setPickedId(other.id)}
          >
            #{other.jersey} {other.name}
          </button>
        ))}
      </div>
      {games.some((game) => !player.perGame.has(game.label) && (game.unassignedJerseys ?? 0) > 0) && (
        <p className="muted" style={{ marginTop: 12 }}>
          {player.name} has data from {player.gamesPlayed} of {games.length} games — some jersey detections may be
          unmatched.
        </p>
      )}
      <div className="toggle-row" style={{ marginTop: 16 }}>
        <span className="muted">View:</span>
        {MODES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            className={`toggle-btn ${mode === value ? "active" : ""}`}
            onClick={() => setMode(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "per60" && <MinutesNotice team={team} />}
      {highTrackingGames.length > 0 && <HighTrackingNotice games={highTrackingGames} />}

      <ScoutingReport key={player.id} player={player} autoReport={reports[player.id]} />

      <div className="grid">
        <StatCard value={player.gamesPlayed} label="Games" />
        {SUMMARY_STATS.flatMap((stat) =>
          stat === "Passes successful"
            ? [
                <StatCard key="rate" value={`${passAccuracy(player)}%`} label="Pass %" tip={TIPS["Pass %"]} />,
                <StatCard key={stat} value={statValue(stat)} label={statLabel("Successful Passes")} tip={TIPS[stat]} />,
              ]
            : [<StatCard key={stat} value={statValue(stat)} label={statLabel(stat)} tip={TIPS[stat]} />],
        )}
        {mode === "perGame" ? (
          <>
            <StatCard value={averagePerGame(player, "Minutes tracked")} label="Minutes /game" />
            <StatCard value={(averagePerGame(player, "Distance tracked") * KM_PER_MILE).toFixed(1)} label="KM Run /game" />
          </>
        ) : (
          <>
            <StatCard value={Math.round(player.totals["Minutes tracked"] ?? 0)} label="Total Minutes" />
            <StatCard value={((player.totals["Distance tracked"] ?? 0) * KM_PER_MILE).toFixed(1)} label="Total KM Run" />
          </>
        )}
        <StatCard value={((player.totals["Top speed"] ?? 0) * KM_PER_MILE).toFixed(1)} label="Top Speed (kph)" />
      </div>

      <div className="toggle-row">
        <span className="muted">Trend:</span>
        <select aria-label="Trend stat" value={trendStat} onChange={(event) => setTrendStat(event.target.value)}>
          {TREND_STATS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="chart-row">
        <div className="chart-container"><h3>{trendStat} Over Season</h3><Chart config={trend} /></div>
        <div className="chart-container"><h3>Player Profile (per 60 min)</h3><Chart config={radar} /></div>
      </div>

      <div className="chart-container">
        <h3>Game Log</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Date</th>
                <th>Opponent</th>
                {LOG_COLUMNS.map(([column]) => (
                  <th key={column} data-tip={COLUMN_TIPS[column]}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const line = player.perGame.get(game.label);
                return (
                  <tr key={game.id}>
                    <td><strong>{game.label}</strong></td>
                    <td>{game.date}</td>
                    <td>{game.opponent ?? "—"}</td>
                    {LOG_COLUMNS.map(([column, stat]) => {
                      if (!line) return <td key={column}>—</td>;
                      if (column === "Min" && line["Minutes tracked"] === undefined) return <td key={column}>—</td>;
                      const value = line[stat ?? ""] ?? 0;
                      if (column === "Pass %") return <td key={column}>{value}%</td>;
                      if (column === "Top Spd (kph)" || column === "KM") {
                        return <td key={column}>{(value * KM_PER_MILE).toFixed(1)}</td>;
                      }
                      return <td key={column}>{value}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
