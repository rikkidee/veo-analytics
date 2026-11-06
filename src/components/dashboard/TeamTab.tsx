"use client";

import { useMemo } from "react";
import { KM_PER_MILE, type TeamModel, type TeamStatName } from "@/lib/dashboard";
import Chart, { baseOptions, percentOptions, type ChartConfig } from "./Chart";
import { StatCard } from "./parts";

const OWN = { bar: "#1f6feb", fill: "rgba(31,111,235,.1)" };
const OPP = { bar: "#da3633", fill: "rgba(218,54,51,.1)" };

export default function TeamTab({ team }: { team: TeamModel }) {
  const { games, players, ownLabel } = team;
  const labels = games.map((game) => game.label);
  const own = (stat: TeamStatName) => games.map((game) => game.stats[stat].own ?? 0);
  const opp = (stat: TeamStatName) => games.map((game) => game.stats[stat].opp ?? 0);
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

  const n = games.length;
  const goalsFor = sum(own("Goals"));
  const goalsAgainst = sum(opp("Goals"));
  const passes = sum(own("Total passes"));
  const successful = sum(own("Successful passes"));
  const attempts = sum(own("Total attempts"));
  const corners = sum(own("Corners"));
  const fouls = sum(own("Fouls"));
  // Games without a reading are left out, so they don't drag the average down.
  const possessionReadings = games.flatMap((game) => game.stats.Possession.own ?? []);
  const avgPossession = possessionReadings.length > 0 ? `${Math.round(sum(possessionReadings) / possessionReadings.length)}%` : "—";
  // With no opponent numbers these are unknown, and 0 would read as a clean sheet.
  const opponentKnown = games.some((game) => game.stats.Goals.opp !== null);
  const gamesWithoutTeamStats = games.filter((game) => !game.hasTeamStats).length;

  const distanceKm = (label: string) =>
    players.reduce((total, player) => total + (player.perGame.get(label)?.["Distance tracked"] ?? 0), 0) * KM_PER_MILE;
  const totalDistanceKm = sum(games.map((game) => distanceKm(game.label)));

  let wins = 0;
  let draws = 0;
  let losses = 0;
  for (const { stats } of games) {
    const { own: scored, opp: conceded } = stats.Goals;
    // A game with no score read isn't a draw.
    if (scored === null || conceded === null) continue;
    if (scored > conceded) wins++;
    else if (scored === conceded) draws++;
    else losses++;
  }

  const playerTotal = (stat: string) =>
    players.reduce((total, player) => total + (player.totals[stat] ?? 0), 0);

  const charts = useMemo(() => {
    const series = (stat: TeamStatName) => [
      games.map((game) => game.stats[stat].own ?? 0),
      games.map((game) => game.stats[stat].opp ?? 0),
    ];
    const bars = (stat: TeamStatName, ownColor = OWN.bar): ChartConfig => {
      const [ownValues, oppValues] = series(stat);
      return {
        type: "bar",
        data: {
          labels,
          datasets: [
            { label: ownLabel, data: ownValues, backgroundColor: ownColor },
            { label: "OPP", data: oppValues, backgroundColor: OPP.bar },
          ],
        },
        options: baseOptions,
      };
    };
    const lines = (
      stat: TeamStatName,
      suffix: string,
      options: object,
      opponentLabel: string,
      [first, second] = [
        { border: OWN.bar, fill: OWN.fill },
        { border: OPP.bar, fill: OPP.fill },
      ],
    ): ChartConfig => {
      const [ownValues, oppValues] = series(stat);
      return {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: `${ownLabel}${suffix}`, data: ownValues, borderColor: first.border, backgroundColor: first.fill, fill: true, tension: 0.3 },
            { label: opponentLabel, data: oppValues, borderColor: second.border, backgroundColor: second.fill, fill: true, tension: 0.3 },
          ],
        },
        options,
      };
    };

    const defense = games.map((game) => {
      const totals = { tackles: 0, duels: 0, interceptions: 0, recoveries: 0 };
      for (const player of players) {
        const line = player.perGame.get(game.label);
        if (!line) continue;
        totals.tackles += line.Tackles ?? 0;
        totals.duels += line.Duels ?? 0;
        totals.interceptions += line.Interceptions ?? 0;
        totals.recoveries += line["Loose ball recoveries"] ?? 0;
      }
      return totals;
    });
    const defenseLine = (label: string, key: keyof (typeof defense)[number], borderColor: string) => ({
      label,
      data: defense.map((game) => game[key]),
      borderColor,
      tension: 0.3,
      pointRadius: 5,
    });

    return {
      goals: bars("Goals"),
      attempts: bars("Total attempts"),
      possession: lines("Possession", " %", percentOptions, "OPP %"),
      passing: lines("Successful passes", "", baseOptions, "OPP"),
      accuracy: lines("Pass accuracy", " %", percentOptions, "Opponent %", [
        { border: "#3fb950", fill: "rgba(63,185,80,.1)" },
        { border: "#f0883e", fill: "rgba(240,136,62,.1)" },
      ]),
      defense: {
        type: "line",
        data: {
          labels,
          datasets: [
            defenseLine("Tackles", "tackles", "#58a6ff"),
            defenseLine("Duels", "duels", "#f0883e"),
            defenseLine("Interceptions", "interceptions", "#3fb950"),
            defenseLine("Recoveries", "recoveries", "#d2a8ff"),
          ],
        },
        options: baseOptions,
      } as ChartConfig,
      corners: bars("Corners", "#3fb950"),
      distance: {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: ownLabel,
              data: games.map((game) =>
                Math.round(
                  players.reduce((total, player) => total + (player.perGame.get(game.label)?.["Distance tracked"] ?? 0), 0) * KM_PER_MILE * 10,
                ) / 10,
              ),
              borderColor: OWN.bar,
              backgroundColor: OWN.fill,
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: baseOptions,
      } as ChartConfig,
    };
    // labels is derived from games.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, players, ownLabel]);

  return (
    <>
      {gamesWithoutTeamStats > 0 && (
        <p role="status" className="chart-error" style={{ marginTop: 24 }}>
          {gamesWithoutTeamStats} of {n} {n === 1 ? "game has" : "games have"} no team stats saved, so opponent
          numbers, possession and the record leave {gamesWithoutTeamStats === 1 ? "it" : "them"} out. This
          team&apos;s own numbers are totaled from its players, which can run lower than the real team figures. Import{" "}
          {gamesWithoutTeamStats === 1 ? "it" : "them"} again to fill the rest in.
        </p>
      )}
      <div className="section-title">Season Summary</div>
      <div className="grid">
        <StatCard value={n} label="Games" />
        <StatCard value={opponentKnown ? `${wins}-${draws}-${losses}` : "—"} label="W-D-L" tone="green" />
        <StatCard value={goalsFor} label="Goals For" />
        <StatCard
          value={opponentKnown ? goalsAgainst : "—"}
          label="Goals Against"
          tone={!opponentKnown ? undefined : goalsAgainst > goalsFor ? "red" : "green"}
        />
        <StatCard value={players.length} label="Players" />
        <StatCard value={avgPossession} label="Avg Possession" />
      </div>

      <div className="section-title">Offensive Stats</div>
      <div className="grid">
        <StatCard value={(goalsFor / n).toFixed(1)} label="Goals / Game" />
        <StatCard value={(attempts / n).toFixed(1)} label="Shots / Game" />
        <StatCard value={`${attempts > 0 ? Math.round((goalsFor / attempts) * 100) : 0}%`} label="Conversion Rate" />
        <StatCard value={(corners / n).toFixed(1)} label="Corners / Game" />
      </div>
      <div className="chart-row">
        <div className="chart-container"><h3>Goals Scored vs Conceded</h3><Chart config={charts.goals} /></div>
        <div className="chart-container"><h3>Shots per Game</h3><Chart config={charts.attempts} /></div>
      </div>

      <div className="section-title">Possession &amp; Distribution</div>
      <div className="grid">
        <StatCard value={(passes / n).toFixed(0)} label="Passes / Game" />
        <StatCard value={(successful / n).toFixed(0)} label="Successful / Game" />
        <StatCard value={`${passes > 0 ? Math.round((successful / passes) * 100) : 0}%`} label="Pass Accuracy" />
        <StatCard value={avgPossession} label="Avg Possession" />
        {totalDistanceKm > 0 && <StatCard value={(totalDistanceKm / n).toFixed(1)} label="Distance / Game (km)" />}
      </div>
      <div className="chart-row">
        <div className="chart-container"><h3>Possession %</h3><Chart config={charts.possession} /></div>
        <div className="chart-container"><h3>Completed Passes</h3><Chart config={charts.passing} /></div>
      </div>
      <div className="chart-row">
        <div className="chart-container"><h3>Pass Accuracy %</h3><Chart config={charts.accuracy} /></div>
        {totalDistanceKm > 0 ? (
          <div className="chart-container"><h3>Team Distance (km)</h3><Chart config={charts.distance} /></div>
        ) : (
          <div className="chart-container" style={{ visibility: "hidden" }} />
        )}
      </div>

      <div className="section-title">Defensive Stats</div>
      <div className="grid">
        <StatCard value={opponentKnown ? (goalsAgainst / n).toFixed(1) : "—"} label="Goals Conceded / Game" />
        <StatCard value={(playerTotal("Tackles") / n).toFixed(0)} label="Tackles / Game" />
        <StatCard value={(playerTotal("Duels") / n).toFixed(0)} label="Duels / Game" />
        <StatCard value={(playerTotal("Interceptions") / n).toFixed(0)} label="Interceptions / Game" />
        <StatCard value={(playerTotal("Loose ball recoveries") / n).toFixed(0)} label="Recoveries / Game" />
        <StatCard value={(fouls / n).toFixed(1)} label="Fouls / Game" />
      </div>
      <div className="chart-row">
        <div className="chart-container"><h3>Defensive Actions per Game</h3><Chart config={charts.defense} /></div>
        <div className="chart-container"><h3>Corners per Game</h3><Chart config={charts.corners} /></div>
      </div>
    </>
  );
}
