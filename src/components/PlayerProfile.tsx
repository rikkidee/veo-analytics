"use client";

import type { ChartConfiguration } from "chart.js";
import { useMemo, useState } from "react";
import ChartCanvas, { useChartTheme } from "@/components/ChartCanvas";
import { formatStat, metricValue, type MetricMode, type TeamSummary } from "@/lib/stats";

const MAX_RADAR_AXES = 8;

export default function PlayerProfile({ summary }: { summary: TeamSummary }) {
  const theme = useChartTheme();
  const withData = summary.players.filter((player) => player.gamesPlayed > 0);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const player = withData.find((other) => other.id === pickedId) ?? withData[0];

  // Per 60 is fairer to substitutes, so it's used whenever minutes exist.
  const mode: MetricMode = summary.hasMinutes ? "per60" : "average";
  const axes = useMemo(
    () =>
      summary.metrics
        .filter((metric) => summary.totals[metric] > 0)
        .slice(0, MAX_RADAR_AXES),
    [summary],
  );

  const config = useMemo<ChartConfiguration | null>(() => {
    if (!player || axes.length < 3) return null;

    const rows = axes.map((metric) => {
      const values = withData
        .map((other) => metricValue(other, metric, mode))
        .filter((value): value is number => value !== null);
      const best = Math.max(...values, 0);
      const average = values.length
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
      const own = metricValue(player, metric, mode) ?? 0;
      return {
        metric,
        own,
        average,
        ownScore: best > 0 ? (own / best) * 100 : 0,
        averageScore: best > 0 ? (average / best) * 100 : 0,
      };
    });

    return {
      type: "radar",
      data: {
        labels: axes,
        datasets: [
          {
            label: player.name,
            data: rows.map((row) => row.ownScore),
            borderColor: theme.series1,
            backgroundColor: `${theme.series1}33`,
            pointBackgroundColor: theme.series1,
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            fill: true,
          },
          {
            label: "Team average",
            data: rows.map((row) => row.averageScore),
            borderColor: theme.series2,
            backgroundColor: "transparent",
            pointBackgroundColor: theme.series2,
            pointStyle: "rectRot",
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 25 },
            grid: { color: theme.grid },
            angleLines: { color: theme.grid },
            pointLabels: { color: theme.text },
          },
        },
        plugins: {
          legend: { position: "bottom", labels: { color: theme.text, usePointStyle: true } },
          tooltip: {
            backgroundColor: theme.tooltipBackground,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            callbacks: {
              label: (item) => {
                const row = rows[item.dataIndex];
                const value = item.datasetIndex === 0 ? row.own : row.average;
                return `${item.dataset.label}: ${formatStat(value, row.metric)}`;
              },
            },
          },
        },
      },
    };
  }, [player, axes, mode, withData, theme]);

  if (!player) {
    return (
      <section className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="font-semibold">Player profile</h2>
        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
          No player stats have been saved yet.
        </p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Player profile</h2>
      <select
        aria-label="Player"
        value={player.id}
        onChange={(event) => setPickedId(event.target.value)}
        className="min-w-0 rounded-md border border-neutral-300 bg-transparent p-1.5 text-sm dark:border-neutral-700"
      >
        {withData.map((other) => (
          <option key={other.id} value={other.id}>
            #{other.jersey} {other.name}
          </option>
        ))}
      </select>

      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {player.position ? `${player.position} · ` : ""}
        {player.gamesPlayed} {player.gamesPlayed === 1 ? "game" : "games"}
        {player.minutes !== null ? ` · ${Math.round(player.minutes)} minutes` : ""}
      </p>

      {config ? (
        <>
          <ChartCanvas
            config={config}
            height={320}
            label={`${player.name} compared with the team average`}
          />
          <p className="text-xs text-neutral-600 dark:text-neutral-400">
            {mode === "per60" ? "Per 60 minutes" : "Per game"}. Each axis runs from zero to the
            team&apos;s best at that stat.
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The radar chart needs at least three stats with data.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutral-600 dark:text-neutral-400">
              <th className="font-medium">Stat</th>
              <th className="text-right font-medium">Total</th>
              <th className="text-right font-medium">Per game</th>
              <th className="text-right font-medium">Per 60</th>
            </tr>
          </thead>
          <tbody>
            {summary.metrics.map((metric) => (
              <tr key={metric}>
                <td>{metric}</td>
                {(["total", "average", "per60"] as const).map((column) => (
                  <td key={column} className="text-right tabular-nums">
                    {formatStat(metricValue(player, metric, column), metric)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
