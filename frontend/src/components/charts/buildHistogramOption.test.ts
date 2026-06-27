import { describe, it, expect } from 'vitest';
import { buildHistogramOption, formatBucketTime } from './buildHistogramOption';
import type { HistoBucket } from '../../types';

const bars: HistoBucket[] = [
  { t: '1719320400000000', h: 0.5, c: 10 },
  { t: '1719320430000000', h: 1.0, c: 25 },
  { t: 'not-a-date', h: 0.2, c: 3 },
];

// series can be an array or a single object in EChartsOption; normalize for assertions.
function firstSeries(opt: ReturnType<typeof buildHistogramOption>): any {
  const s = (opt as any).series;
  return Array.isArray(s) ? s[0] : s;
}

describe('formatBucketTime', () => {
  it('renders a parseable epoch-micros key as HH:mm', () => {
    expect(formatBucketTime('1719320400000000')).toMatch(/^\d{2}:\d{2}$/);
  });
  it('returns unparseable values verbatim', () => {
    expect(formatBucketTime('not-a-date')).toBe('not-a-date');
  });
});

describe('buildHistogramOption', () => {
  it('builds a bar series from the raw bucket counts', () => {
    const series = firstSeries(buildHistogramOption(bars, '#2dd4bf'));
    expect(series.type).toBe('bar');
    expect(series.data).toEqual([10, 25, 3]);
  });

  it('labels the x-axis with one entry per bucket, verbatim when unparseable', () => {
    const opt = buildHistogramOption(bars, '#2dd4bf') as any;
    expect(opt.xAxis.data).toHaveLength(3);
    expect(opt.xAxis.data[2]).toBe('not-a-date');
  });

  it('themes bars with a vertical accent gradient', () => {
    const series = firstSeries(buildHistogramOption(bars, '#2dd4bf'));
    const color = series.itemStyle.color;
    expect(color.type).toBe('linear');
    expect(color.colorStops[0].color).toBe('#2dd4bf');
    expect(color.colorStops[1].color).toBe('rgba(45,212,191,0.32)');
  });

  it('handles empty input', () => {
    const opt = buildHistogramOption([], '#2dd4bf') as any;
    expect(firstSeries(opt).data).toEqual([]);
    expect(opt.xAxis.data).toEqual([]);
  });
});
