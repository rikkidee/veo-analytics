"use client";

import type { Chart as ChartJs, ChartConfiguration } from "chart.js";
import { createContext, use, useEffect, useRef } from "react";

declare global {
  interface Window {
    Chart?: typeof ChartJs;
  }
}

export const CHART_JS_URL = "https://cdn.jsdelivr.net/npm/chart.js@4.6.1/dist/chart.umd.js";

/** True once Chart.js has loaded from the CDN. */
export const ChartReady = createContext(false);

export type ChartConfig = ChartConfiguration;

/** Pass a memoized config: a new object redraws the chart. */
export default function Chart({ config }: { config: ChartConfig }) {
  const ready = use(ChartReady);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const parent = canvas.current?.parentElement;
    if (!ready || !window.Chart || !canvas.current || !parent) return;
    const chart = new window.Chart(canvas.current, config);
    // A chart made in a hidden tab otherwise grows in steps once its tab is shown.
    const observer = new ResizeObserver(() => {
      if (parent.clientWidth > 0) chart.resize();
    });
    observer.observe(parent);
    return () => {
      observer.disconnect();
      chart.destroy();
    };
  }, [ready, config]);

  return <canvas ref={canvas} />;
}

export const SERIES_COLORS = [
  "#58a6ff", "#f0883e", "#3fb950", "#d2a8ff", "#f778ba", "#a5d6ff", "#ffd33d",
  "#ff7b72", "#79c0ff", "#56d364", "#db61a2", "#e3b341", "#bc8cff", "#7ee787",
];

export const baseOptions = {
  responsive: true,
  plugins: { legend: { labels: { color: "#c9d1d9" } } },
  scales: {
    x: { ticks: { color: "#8b949e" }, grid: { color: "#21262d" } },
    y: { ticks: { color: "#8b949e" }, grid: { color: "#21262d" }, beginAtZero: true },
  },
};

export const percentOptions = {
  ...baseOptions,
  scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, min: 0, max: 100 } },
};
