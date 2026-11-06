"use client";

import { useState } from "react";
import { TEAM_STATS, type TeamModel } from "@/lib/dashboard";
import { StatCard } from "./parts";

const PERCENT_STATS = new Set(["Possession", "Pass accuracy"]);

export default function GameLogTab({ team }: { team: TeamModel }) {
  const { games, players, ownLabel } = team;
  const [gameId, setGameId] = useState(games[0]?.id);
  const game = games.find((other) => other.id === gameId) ?? games[0];

  const format = (stat: string, value: number | null) =>
    value === null ? "—" : `${value}${PERCENT_STATS.has(stat) ? "%" : ""}`;

  const gamePlayers = players
    .flatMap((player) => {
      const line = player.perGame.get(game.label);
      return line && (line["Minutes tracked"] ?? 0) > 0 ? [{ player, line }] : [];
    })
    .sort((a, b) => (b.line["Minutes tracked"] ?? 0) - (a.line["Minutes tracked"] ?? 0));

  return (
    <>
      <div className="section-title">Game Log</div>
      <div className="toggle-row">
        <select
          aria-label="Game"
          style={{ minWidth: 250 }}
          value={game.id}
          onChange={(event) => setGameId(event.target.value)}
        >
          {games.map((other) => (
            <option key={other.id} value={other.id}>
              {other.label} — {other.date}
            </option>
          ))}
        </select>
      </div>
      <div className="grid">
        {TEAM_STATS.map((stat) => (
          <StatCard
            key={stat}
            value={`${format(stat, game.stats[stat].own)} — ${format(stat, game.stats[stat].opp)}`}
            label={`${stat} (${ownLabel} vs OPP)`}
          />
        ))}
      </div>
      <div className="chart-container" style={{ marginTop: 16 }}>
        <h3>Player Stats — {game.label}</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                {["Player", "Min", "Goals", "Shots", "Pass Succ", "Pass %", "Tackles", "Duels", "Int", "Dribbles", "Recoveries", "HI Runs", "Sprints", "Top Spd"].map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gamePlayers.map(({ player, line }) => (
                <tr key={player.id}>
                  <td><strong>#{player.jersey} {player.name}</strong></td>
                  <td>{line["Minutes tracked"] ?? 0}</td>
                  <td>{line.Goals ?? 0}</td>
                  <td>{line.Shots ?? 0}</td>
                  <td>{line["Passes successful"] ?? 0}</td>
                  <td>{line["Pass %"]}%</td>
                  <td>{line.Tackles ?? 0}</td>
                  <td>{line.Duels ?? 0}</td>
                  <td>{line.Interceptions ?? 0}</td>
                  <td>{line.Dribbles ?? 0}</td>
                  <td>{line["Loose ball recoveries"] ?? 0}</td>
                  <td>{line["High-intensity runs"] ?? 0}</td>
                  <td>{line.Sprints ?? 0}</td>
                  <td>{line["Top speed"] ? line["Top speed"].toFixed(1) : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
