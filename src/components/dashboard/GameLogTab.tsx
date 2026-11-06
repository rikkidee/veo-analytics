"use client";

import { useState } from "react";
import { KM_PER_MILE, TEAM_STATS, type TeamModel } from "@/lib/dashboard";
import { HighTrackingNotice, StatCard } from "./parts";

const PERCENT_STATS = new Set(["Possession", "Pass accuracy"]);

export default function GameLogTab({ team }: { team: TeamModel }) {
  const { games, players, ownLabel } = team;
  const [gameId, setGameId] = useState(games[0]?.id);
  const position = Math.max(0, games.findIndex((other) => other.id === gameId));
  const game = games[position];
  // A total with nothing to compare it to reads as a lopsided result rather than a comparison.
  const statsShown = TEAM_STATS.filter(
    (stat) => stat !== "Total passes" || (game.stats[stat].own !== null && game.stats[stat].opp !== null),
  );

  const format = (stat: string, value: number | null) =>
    value === null ? "—" : `${value}${PERCENT_STATS.has(stat) ? "%" : ""}`;

  const gamePlayers = players
    .flatMap((player) => {
      const line = player.perGame.get(game.label);
      // A row of 0 minutes means they didn't play. A row with no minutes still has real stats.
      return line && line["Minutes tracked"] !== 0 ? [{ player, line }] : [];
    })
    .sort((a, b) => (b.line["Minutes tracked"] ?? 0) - (a.line["Minutes tracked"] ?? 0));

  return (
    <>
      <div className="section-title">Game Log</div>
      <div className="toggle-row">
        <button
          type="button"
          className="toggle-btn"
          disabled={position === 0}
          onClick={() => setGameId(games[position - 1].id)}
        >
          <span aria-hidden="true">← </span>Back
        </button>
        <select
          aria-label="Game"
          style={{ minWidth: 250 }}
          value={game.id}
          onChange={(event) => setGameId(event.target.value)}
        >
          {games.map((other) => (
            <option key={other.id} value={other.id}>
              {other.label} — {other.date}
              {other.opponent ? ` vs ${other.opponent}` : ""}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="toggle-btn"
          disabled={position === games.length - 1}
          onClick={() => setGameId(games[position + 1].id)}
        >
          Next<span aria-hidden="true"> →</span>
        </button>
      </div>
      {game.trackingLooksHigh && <HighTrackingNotice games={[game]} />}
      <div className="grid">
        {statsShown.map((stat) => (
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
                {["Player", "Min", "Goals", "Shots", "Pass Succ", "Pass %", "Tackles", "Duels", "Int", "Dribbles", "Recoveries", "HI Runs", "Sprints", "Top Spd (kph)"].map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gamePlayers.map(({ player, line }) => (
                <tr key={player.id}>
                  <td><strong>#{player.jersey} {player.name}</strong></td>
                  <td>{line["Minutes tracked"] ?? "—"}</td>
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
                  <td>{line["Top speed"] ? (line["Top speed"] * KM_PER_MILE).toFixed(1) : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
