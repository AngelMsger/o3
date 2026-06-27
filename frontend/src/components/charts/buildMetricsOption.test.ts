import { describe, it, expect } from 'vitest';
import { buildMetricsOption } from './buildMetricsOption';
import type { MetricSeries } from './buildMetricsOption';

const series: MetricSeries[] = [
  { name: 'http{svc="api"}', labels: { svc: 'api' }, points: [{ t: 1719320400000, v: 12 }, { t: 1719320430000, v: 13 }] },
  { name: 'http{svc="web"}', labels: { svc: 'web' }, points: [{ t: 1719320400000, v: 4 }] },
];

describe('buildMetricsOption', () => {
  it('builds one line series per metric series, on a time axis', () => {
    const opt = buildMetricsOption(series, '#2dd4bf') as any;
    expect(opt.xAxis.type).toBe('time');
    expect(opt.series).toHaveLength(2);
    expect(opt.series[0].type).toBe('line');
    expect(opt.series[0].data).toEqual([[1719320400000, 12], [1719320430000, 13]]);
  });

  it('leads the palette with the accent and lists series in the legend', () => {
    const opt = buildMetricsOption(series, '#2dd4bf') as any;
    expect(opt.color[0]).toBe('#2dd4bf');
    expect(opt.legend.data).toEqual(['http{svc="api"}', 'http{svc="web"}']);
  });

  it('includes an inside + slider dataZoom brush', () => {
    const opt = buildMetricsOption(series, '#2dd4bf') as any;
    const types = opt.dataZoom.map((z: any) => z.type);
    expect(types).toContain('inside');
    expect(types).toContain('slider');
  });

  it('handles empty input', () => {
    const opt = buildMetricsOption([], '#2dd4bf') as any;
    expect(opt.series).toEqual([]);
    expect(opt.legend.data).toEqual([]);
  });
});
