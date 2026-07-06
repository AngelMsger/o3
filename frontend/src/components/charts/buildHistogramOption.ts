import type { EChartsOption } from 'echarts';
import { hexA } from '../../lib/format';
import type { HistoBucket } from '../../types';

// bucketMs parses an OpenObserve histogram bucket key to epoch milliseconds. The key
// is either an ISO-ish local-time string (e.g. "2026-06-26T10:00:30", no zone) or epoch
// micros as a numeric string. Returns NaN when unparseable.
export function bucketMs(t: string): number {
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.getTime();
  const n = Number(t);
  if (!isNaN(n)) return n / 1000; // micros -> ms
  return NaN;
}

// formatBucketTime renders a bucket key as HH:mm in local time; HH:mm:ss when withSeconds.
// Unparseable values render verbatim. (Kept here so the option builder is pure and
// unit-testable without a DOM/canvas.)
export function formatBucketTime(t: string, withSeconds = false): string {
  const ms = bucketMs(t);
  if (isNaN(ms)) return t;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return withSeconds ? `${base}:${p(d.getSeconds())}` : base;
}

// bucketRangeMicros maps a bucket index range [lo, hi] (inclusive) to the [start, end)
// epoch-micros window it covers. The window starts at bucket lo and ends at bucket hi
// plus one bucket width, so the whole selected span (including the last bucket) is
// included. Bucket width is inferred from the first two buckets; a lone bucket falls
// back to 30s. Returns null when the endpoints are missing or unparseable.
export function bucketRangeMicros(
  bars: HistoBucket[],
  lo: number,
  hi: number,
): { startMicros: number; endMicros: number } | null {
  if (lo > hi) [lo, hi] = [hi, lo];
  const start = bars[lo] && bucketMs(bars[lo].t);
  const last = bars[hi] && bucketMs(bars[hi].t);
  if (start == null || last == null || isNaN(start) || isNaN(last)) return null;
  let width = 30_000; // fallback: 30s buckets
  if (bars.length > 1) {
    const w = bucketMs(bars[1].t) - bucketMs(bars[0].t);
    if (!isNaN(w) && w > 0) width = w;
  }
  return {
    startMicros: Math.round(start * 1000),
    endMicros: Math.round((last + width) * 1000),
  };
}

// buildHistogramOption maps event-volume buckets to an ECharts bar option. It mirrors
// the design's compact look (no y-axis, thin x labels) and themes bars with a vertical
// accent gradient, reacting to the runtime accent value. The gradient uses ECharts'
// plain-object form so this module stays free of any echarts runtime import.
export function buildHistogramOption(bars: HistoBucket[], accent: string): EChartsOption {
  const labels = bars.map((b) => formatBucketTime(b.t));
  const counts = bars.map((b) => b.c);

  return {
    animation: false,
    grid: { left: 0, right: 0, top: 6, bottom: 18, containLabel: false },
    // A declared toolbox (even hidden) stops the brush component from auto-creating its
    // default rect/polygon/keep/clear button bar — we only want a bare drag gesture.
    // (In ECharts 6, `brush.toolbox: []` alone does NOT suppress those buttons.)
    toolbox: { show: false },
    // Drag-to-select a time range. Brushing is armed persistently via `takeGlobalCursor`
    // in Histogram; this styles the drag overlay to the design's accent tint. brushEnd
    // fires with the selected category-index range, which the caller maps to a window.
    brush: {
      xAxisIndex: 0,
      brushType: 'lineX',
      brushMode: 'single',
      transformable: false,
      removeOnClick: false,
      throttleType: 'debounce',
      throttleDelay: 80,
      brushStyle: {
        borderWidth: 1,
        borderColor: hexA(accent, 0.5),
        color: hexA(accent, 0.1),
      },
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#0f131a',
      borderColor: 'rgba(255,255,255,0.12)',
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: '#dde3ee', fontSize: 11 },
      // params is an array under axis trigger; we only read the hovered index.
      formatter: (params: any) => {
        const p = Array.isArray(params) ? params[0] : params;
        const i = p?.dataIndex ?? 0;
        return `${formatBucketTime(bars[i]?.t ?? '')}<br/><b>${(counts[i] ?? 0).toLocaleString()}</b> events`;
      },
    },
    xAxis: {
      type: 'category',
      data: labels,
      boundaryGap: true,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: {
        color: '#4b5362',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9.5,
        interval: 'auto',
        hideOverlap: true,
      },
    },
    yAxis: { type: 'value', show: false },
    series: [
      {
        type: 'bar',
        data: counts,
        barCategoryGap: '20%',
        itemStyle: {
          borderRadius: [2, 2, 0, 0],
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: accent },
              { offset: 1, color: hexA(accent, 0.32) },
            ],
          },
        },
      },
    ],
  };
}
