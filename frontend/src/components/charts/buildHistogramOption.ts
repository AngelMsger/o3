import type { EChartsOption } from 'echarts';
import { hexA } from '../../lib/format';
import type { HistoBucket } from '../../types';

// formatBucketTime renders an OpenObserve histogram bucket key (an ISO-ish timestamp
// string, or epoch micros as a numeric string) as HH:mm in local time. Unparseable
// values render verbatim. (Moved here from Histogram so the option builder is pure
// and unit-testable without a DOM/canvas.)
export function formatBucketTime(t: string): string {
  let d = new Date(t);
  if (isNaN(d.getTime())) {
    const n = Number(t);
    if (!isNaN(n)) d = new Date(n / 1000); // micros -> ms
  }
  if (isNaN(d.getTime())) return t;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
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
