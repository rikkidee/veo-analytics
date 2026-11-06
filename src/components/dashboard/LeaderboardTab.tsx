"use client";

import { useMemo, useState } from "react";
import { KM_PER_MILE, type TeamModel } from "@/lib/dashboard";
import Chart, { SERIES_COLORS, type ChartConfig } from "./Chart";
import { MinutesNotice } from "./parts";

const STATS: [string, string][] = [
  ["Goals", "Goals"], ["Passes successful", "Successful Passes"], ["Pass %", "Pass %"], ["Tackles", "Tackles"],
  ["Duels", "Duels"], ["Interceptions", "Interceptions"], ["Loose ball recoveries", "Ball Recoveries"], ["Shots", "Shots"],
  ["Dribbles", "Dribbles"], ["Sprints", "Sprints"], ["High-intensity runs", "High-intensity Runs"],
  ["Distance tracked", "Distance (km)"], ["Top speed", "Top Speed (kph)"], ["Minutes tracked", "Minutes Tracked"],
];

// A rate or a peak stays the same however long someone played.
const NOT_PER_60 = new Set(["Pass %", "Top speed"]);
const IN_MILES = new Set(["Distance tracked", "Top speed"]);

const round1 = (value: number) => Math.round(value * 10) / 10;

type Row = { id: string; name: string; value: number; total: number; per60: number; games: number; mins: number };
type SortColumn = "total" | "per60" | "games" | "mins" | "name";

const COLUMNS: [SortColumn, string][] = [
  ["name", "Player"], ["total", "Total"], ["per60", "/60 Min"], ["games", "Games"], ["mins", "Minutes"],
];

export default function LeaderboardTab({ team }: { team: TeamModel }) {
  const [stat, setStat] = useState("Goals");
  const [mode, setMode] = useState<"total" | "per60">("total");
  const [sort, setSort] = useState<{ column: SortColumn; ascending: boolean } | null>(null);

  const rows = useMemo<Row[]>(() => {
    return team.players
      .map((player) => {
        const minutes = player.totals["Minutes tracked"] ?? 0;
        let total: number;
        if (stat === "Pass %") {
          const passes = player.totals.Passes ?? 0;
          total = passes > 0 ? Math.round(((player.totals["Passes successful"] ?? 0) / passes) * 100) : 0;
        } else {
          total = round1((player.totals[stat] ?? 0) * (IN_MILES.has(stat) ? KM_PER_MILE : 1));
        }
        const per60 = NOT_PER_60.has(stat)
          ? total
          : round1((player.per60[stat] ?? 0) * (IN_MILES.has(stat) ? KM_PER_MILE : 1));
        return {
          id: player.id,
          name: player.name,
          value: mode === "per60" ? per60 : total,
          total,
          per60,
          games: player.gamesPlayed,
          mins: Math.round(minutes),
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [team.players, stat, mode]);

  const chart = useMemo<ChartConfig>(
    () => ({
      type: "bar",
      data: {
        labels: rows.map((row) => row.name),
        datasets: [
          {
            label: `${stat}${mode === "per60" ? " (Per 60)" : " (Total)"}`,
            data: rows.map((row) => row.value),
            backgroundColor: SERIES_COLORS.slice(0, rows.length),
          },
        ],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8b949e" }, grid: { color: "#21262d" }, beginAtZero: true },
          y: { ticks: { color: "#c9d1d9" }, grid: { display: false } },
        },
      },
    }),
    [rows, stat, mode],
  );

  const sorted = sort
    ? rows.toSorted((a, b) => {
        const order =
          sort.column === "name" ? a.name.localeCompare(b.name) : a[sort.column] - b[sort.column];
        return sort.ascending ? order : -order;
      })
    : rows;

  function toggleSort(column: SortColumn) {
    setSort((current) => ({
      column,
      // Numbers start highest first and names start at A.
      ascending: current?.column === column ? !current.ascending : column === "name",
    }));
  }

  return (
    <>
      <div className="section-title">Season Leaderboards</div>
      <div className="toggle-row">
        <select
          aria-label="Stat"
          value={stat}
          onChange={(event) => {
            setStat(event.target.value);
            setSort(null);
          }}
        >
          {STATS.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          aria-label="Mode"
          value={mode}
          onChange={(event) => {
            setMode(event.target.value as "total" | "per60");
            setSort(null);
          }}
        >
          <option value="total">Season Total</option>
          <option value="per60">Per 60 Min</option>
        </select>
      </div>
      {mode === "per60" && <MinutesNotice team={team} />}
      <div className="chart-container"><Chart config={chart} /></div>
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>#</th>
              {COLUMNS.map(([column, label]) => (
                <th
                  key={column}
                  aria-sort={sort?.column === column ? (sort.ascending ? "ascending" : "descending") : undefined}
                >
                  <button type="button" onClick={() => toggleSort(column)}>
                    {label}
                    {sort?.column === column ? (sort.ascending ? " ▲" : " ▼") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, index) => (
              <tr key={row.id}>
                <td>{index + 1}</td>
                <td><strong>{row.name}</strong></td>
                <td className="highlight">{row.total}</td>
                <td>{row.per60}</td>
                <td>{row.games}</td>
                <td>{row.mins}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
