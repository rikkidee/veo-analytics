"use client";

import { useMemo, useState } from "react";
import { comparisonPlayers, KM_PER_MILE, type TeamModel } from "@/lib/dashboard";
import Chart, { baseOptions, easyHover, type ChartConfig } from "./Chart";
import { MinutesNotice, StatCard } from "./parts";
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

const RADAR_STATS = ["Passes", "Tackles", "Duels", "Interceptions", "Dribbles", "Sprints", "Shots", "Loose ball recoveries"];

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
  const [mode, setMode] = useState<"total" | "per60">("total");
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
    const rows = RADAR_STATS.map((stat) => {
      const values = scalePlayers.map((other) => other.per60[stat] ?? 0);
      const best = Math.max(...values, 1);
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const own = player.per60[stat] ?? 0;
      return { own, average, ownScore: Math.min((own / best) * 100, 100), averageScore: (average / best) * 100 };
    });
    return {
      type: "radar",
      data: {
        labels: RADAR_STATS.map((stat) => (stat === "Loose ball recoveries" ? "Recoveries" : stat)),
        datasets: [
          {
            label: `${player.name} (per 60)`,
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
                return `${item.dataset.label}: ${value.toFixed(1)}${item.datasetIndex === 0 ? "" : " per 60"}`;
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

  const source = mode === "per60" ? player.per60 : player.totals;
  const modeLabel = mode === "per60" ? "/60min" : "total";
  const totalPasses = player.totals.Passes ?? 0;
  const passRate = totalPasses > 0 ? Math.round(((player.totals["Passes successful"] ?? 0) / totalPasses) * 100) : 0;

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
      <div className="toggle-row" style={{ marginTop: 16 }}>
        <span className="muted">View:</span>
        <button type="button" className={`toggle-btn ${mode === "total" ? "active" : ""}`} onClick={() => setMode("total")}>
          Season Total
        </button>
        <button type="button" className={`toggle-btn ${mode === "per60" ? "active" : ""}`} onClick={() => setMode("per60")}>
          Per 60 Min
        </button>
      </div>

      {mode === "per60" && <MinutesNotice team={team} />}

      <ScoutingReport key={player.id} player={player} autoReport={reports[player.id]} />

      <div className="grid">
        <StatCard value={player.gamesPlayed} label="Games" />
        {SUMMARY_STATS.flatMap((stat) =>
          stat === "Passes successful"
            ? [
                <StatCard key="rate" value={`${passRate}%`} label="Pass %" tip={TIPS["Pass %"]} />,
                <StatCard key={stat} value={source[stat] ?? 0} label={`Successful Passes ${modeLabel}`} tip={TIPS[stat]} />,
              ]
            : [<StatCard key={stat} value={source[stat] ?? 0} label={`${stat} ${modeLabel}`} tip={TIPS[stat]} />],
        )}
        <StatCard value={Math.round(player.totals["Minutes tracked"] ?? 0)} label="Total Minutes" />
        <StatCard value={((player.totals["Distance tracked"] ?? 0) * KM_PER_MILE).toFixed(1)} label="Total KM Run" />
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
        <div className="chart-container"><h3>Player Profile</h3><Chart config={radar} /></div>
      </div>

      <div className="chart-container">
        <h3>Game Log</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Game</th>
                <th>Date</th>
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
