"use client";

import type { ChartConfiguration } from "chart.js";
import { useMemo, useState } from "react";
import ChartCanvas, { useChartTheme } from "@/components/ChartCanvas";
import { formatStat, isCountColumn, type TeamSummary } from "@/lib/stats";

const TILE_METRICS = ["Goals", "Shots", "Passes", "Passes success rate"];

function findMetric(summary: TeamSummary, name: string) {
  return summary.metrics.find((metric) => metric.toLowerCase() === name.toLowerCase());
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-neutral-600 dark:text-neutral-400">{detail}</p>}
    </div>
  );
}

export default function TeamOverview({ summary }: { summary: TeamSummary }) {
  const theme = useChartTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const metric = picked && summary.metrics.includes(picked) ? picked : summary.metrics[0];
  const gameCount = summary.games.length;

  const config = useMemo<ChartConfiguration>(
    () => ({
      type: "bar",
      data: {
        labels: summary.games.map(({ game }) => game.game_date),
        datasets: [
          {
            label: metric,
            data: summary.games.map(({ totals }) => totals[metric] ?? 0),
            backgroundColor: theme.series1,
            borderRadius: { topLeft: 4, topRight: 4 },
            borderSkipped: "bottom",
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        animation: false,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.tooltipBackground,
            titleColor: theme.tooltipText,
            bodyColor: theme.tooltipText,
            callbacks: {
              title: ([item]) => {
                const { game } = summary.games[item.dataIndex];
                return `${game.game_date} · ${game.game_label}`;
              },
              label: (item) => `${metric}: ${formatStat(item.parsed.y, metric)}`,
            },
          },
        },
        scales: {
          x: { ticks: { color: theme.text }, grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { color: theme.text, precision: 0 },
            grid: { color: theme.grid },
            border: { display: false },
          },
        },
      },
    }),
    [summary, metric, theme],
  );

  return (
    <section className="flex flex-col gap-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Team overview</h2>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Tile label="Games" value={String(gameCount)} />
        {TILE_METRICS.map((name) => {
          const column = findMetric(summary, name);
          if (!column) return null;
          const value = summary.totals[column];
          return (
            <Tile
              key={column}
              label={column}
              value={formatStat(value, column)}
              detail={
                isCountColumn(column) && gameCount > 0
                  ? `${formatStat(value / gameCount)} per game`
                  : undefined
              }
            />
          );
        })}
      </div>

      {metric && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">By game:</span>
            <select
              value={metric}
              onChange={(event) => setPicked(event.target.value)}
              className="rounded-md border border-neutral-300 bg-transparent p-1.5 dark:border-neutral-700"
            >
              {summary.metrics.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <ChartCanvas config={config} height={240} label={`${metric} in each game, oldest first`} />
        </div>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Games and team stats</summary>
        <ul className="mt-2 flex flex-col gap-3">
          {summary.games.map(({ game }) => {
            const entries = Object.entries(game.team_stats ?? {});
            return (
              <li key={game.id}>
                <p className="font-medium">
                  {game.game_date} · {game.game_label}
                  {game.opponent ? ` · vs ${game.opponent}` : ""}
                </p>
                {entries.length > 0 && (
                  <ul className="mt-1 text-neutral-600 dark:text-neutral-400">
                    {entries.map(([label, stat]) => (
                      <li key={label}>{stat.text ?? label}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}
