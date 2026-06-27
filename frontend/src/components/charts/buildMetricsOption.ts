import type { EChartsOption } from 'echarts';
import { hexA } from '../../lib/format';

// MetricSeries mirrors internal/metrics.Series (Go) as it reaches the frontend.
export interface MetricSeries {
  name: string;
  labels: Record<string, string>;
  points: { t: number; v: number }[];
}

// Palette for additional series; the active accent always leads so a single
// series matches the rest of the app.
const PALETTE = ['#60a5fa', '#f59e0b', '#a78bfa', '#f4685f', '#34d399', '#f5b340', '#7c83ff', '#2dd4bf'];

// buildMetricsOption renders multi-series PromQL output as a time-axis line
// chart with a scrollable legend, shared tooltip, and a dataZoom brush, themed
// to the runtime accent.
export function buildMetricsOption(series: MetricSeries[], accent: string): EChartsOption {
  const palette = [accent, ...PALETTE.filter((c) => c.toLowerCase() !== accent.toLowerCase())];

  return {
    animation: false,
    color: palette,
    grid: { left: 8, right: 18, top: 14, bottom: 70, containLabel: true },
    legend: {
      type: 'scroll',
      bottom: 30,
      textStyle: { color: '#aeb6c4', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 },
      inactiveColor: '#3a4150',
      pageIconColor: accent,
      pageTextStyle: { color: '#4b5362' },
      data: series.map((s) => s.name),
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#0f131a',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: '#dde3ee', fontSize: 11 },
    },
    xAxis: {
      type: 'time',
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: { color: '#4b5362', fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, hideOverlap: true },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#4b5362', fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
    },
    dataZoom: [
      { type: 'inside' },
      {
        type: 'slider',
        height: 14,
        bottom: 6,
        borderColor: 'transparent',
        backgroundColor: 'rgba(255,255,255,0.04)',
        fillerColor: hexA(accent, 0.18),
        handleStyle: { color: accent },
        moveHandleStyle: { color: accent },
        textStyle: { color: '#4b5362', fontSize: 9 },
      },
    ],
    series: series.map((s) => ({
      name: s.name,
      type: 'line',
      showSymbol: false,
      lineStyle: { width: 1.5 },
      data: s.points.map((p) => [p.t, p.v]),
    })),
  };
}
