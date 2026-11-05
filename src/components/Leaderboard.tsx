"use client";

import type { ChartConfiguration } from "chart.js";
import { useMemo, useState } from "react";
import ChartCanvas, { useChartTheme } from "@/components/ChartCanvas";
import { formatStat, isCountColumn, metricValue, type MetricMode, type TeamSummary } from "@/lib/stats";

const TOP_COUNT = 10;
const MODES: { value: MetricMode; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "average", label: "Per game" },
  { value: "per60", label: "Per 60 min" },
];
const selectClass =
  "min-w-0 rounded-md border border-neutral-300 bg-transparent p-1.5 text-sm dark:border-neutral-700";

export default function Leaderboard({ summary }: { summary: TeamSummary }) {
  const theme = useChartTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const [mode, setMode] = useState<MetricMode>("total");
  const metric = picked && summary.metrics.includes(picked) ? picked : summary.metrics[0];

  const ranked = useMemo(
    () =>
      summary.players
        .map((player) => ({ player, value: metricValue(player, metric, mode) }))
        .filter((entry): entry is typeof entry & { value: number } => entry.value !== null)
        .sort((a, b) => b.value - a.value)
        .slice(0, TOP_COUNT),
    [summary, metric, mode],
  );

  const config = useMemo<ChartConfiguration>(
    () => ({
      type: "bar",
      data: {
        labels: ranked.map(({ player }) => `#${player.jersey} ${player.name}`),
        datasets: [
          {
            label: metric,
            data: ranked.map(({ value }) => value),
            backgroundColor: theme.series1,
            borderRadius: { topRight: 4, bottomRight: 4 },
            borderSkipped: "left",
            maxBarThickness: 18,
          },
        ],
      },
      options: {
        indexAxis: "y",
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", axis: "y", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBackground,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            callbacks: {
              label: (item) => `${metric}: ${formatStat(item.parsed.x, metric)}`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: theme.text },
            grid: { color: theme.grid },
            border: { display: false },
          },
          y: { ticks: { color: theme.text }, grid: { display: false } },
        },
      },
    }),
    [ranked, metric, theme],
  );

  const modeApplies = metric ? isCountColumn(metric) : false;

  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Leaderboard</h2>
      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Stat to rank by"
          value={metric}
          onChange={(event) => setPicked(event.target.value)}
          className={selectClass}
        >
          {summary.metrics.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          aria-label="How to count it"
          value={mode}
          disabled={!modeApplies}
          onChange={(event) => setMode(event.target.value as MetricMode)}
          className={selectClass}
        >
          {MODES.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.value === "per60" && !summary.hasMinutes}
            >
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {ranked.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No player has a value for this stat yet.
        </p>
      ) : (
        <>
          <ChartCanvas
            config={config}
            height={Math.max(120, ranked.length * 30 + 40)}
            label={`Top players by ${metric}`}
          />
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Show as a table</summary>
            <table className="mt-2 w-full">
              <thead>
                <tr className="text-left text-neutral-600 dark:text-neutral-400">
                  <th className="font-medium">Player</th>
                  <th className="text-right font-medium">{metric}</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(({ player, value }) => (
                  <tr key={player.id}>
                    <td>
                      #{player.jersey} {player.name}
                    </td>
                    <td className="text-right tabular-nums">{formatStat(value, metric)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
      {!summary.hasMinutes && (
        <p className="text-xs text-neutral-600 dark:text-neutral-400">
          Per 60 needs a minutes column, and the imported reports don&apos;t have one.
        </p>
      )}
    </section>
  );
}
