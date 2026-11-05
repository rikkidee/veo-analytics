"use client";

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
  type ChartConfiguration,
} from "chart.js";
import { useEffect, useRef, useSyncExternalStore } from "react";

Chart.register(
  BarController,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadarController,
  RadialLinearScale,
  Tooltip,
);

const LIGHT = {
  series1: "#2a78d6",
  series2: "#eb6834",
  text: "#52514e",
  grid: "rgba(11, 11, 11, 0.1)",
  tooltipBackground: "#0b0b0b",
  tooltipText: "#f0efec",
};
const DARK: typeof LIGHT = {
  series1: "#3987e5",
  series2: "#d95926",
  text: "#c3c2b7",
  grid: "rgba(240, 239, 236, 0.14)",
  tooltipBackground: "#f0efec",
  tooltipText: "#0b0b0b",
};
export type ChartTheme = typeof LIGHT;

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToColorScheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** Canvas can't read Tailwind's dark variant, so charts get their colors from here. */
export function useChartTheme(): ChartTheme {
  const isDark = useSyncExternalStore(
    subscribeToColorScheme,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false,
  );
  return isDark ? DARK : LIGHT;
}

type ChartCanvasProps = {
  /** Keep this stable with useMemo: a new object redraws the chart. */
  config: ChartConfiguration;
  /** What the chart shows, for screen readers. */
  label: string;
  height: number;
};

export default function ChartCanvas({ config, label, height }: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const chart = new Chart(canvasRef.current, config);
    return () => chart.destroy();
  }, [config]);

  return (
    <div className="relative w-full" style={{ height }}>
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}
