import { describe, it, expect } from 'vitest';
import { buildHistogramOption, formatBucketTime, bucketMs, bucketRangeMicros } from './buildHistogramOption';
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

describe('bucketMs', () => {
  it('parses epoch-micros keys to milliseconds', () => {
    expect(bucketMs('1719320400000000')).toBe(1719320400000);
  });
  it('parses ISO-ish local-time keys', () => {
    expect(bucketMs('2026-06-26T10:00:30')).toBe(new Date('2026-06-26T10:00:30').getTime());
  });
  it('returns NaN for unparseable keys', () => {
    expect(bucketMs('not-a-date')).toBeNaN();
  });
});

describe('bucketRangeMicros', () => {
  it('maps a bucket range to [start, hi + one bucket width) in micros', () => {
    // 30s buckets: end = last bucket start + 30s.
    expect(bucketRangeMicros(bars, 0, 1)).toEqual({
      startMicros: 1719320400000000,
      endMicros: 1719320460000000,
    });
  });
  it('normalizes a reversed range', () => {
    expect(bucketRangeMicros(bars, 1, 0)).toEqual({
      startMicros: 1719320400000000,
      endMicros: 1719320460000000,
    });
  });
  it('falls back to a 30s width for a single bucket', () => {
    const one: HistoBucket[] = [{ t: '1719320400000000', h: 1, c: 5 }];
    expect(bucketRangeMicros(one, 0, 0)).toEqual({
      startMicros: 1719320400000000,
      endMicros: 1719320430000000,
    });
  });
  it('returns null when an endpoint is missing', () => {
    expect(bucketRangeMicros(bars, 0, 9)).toBeNull();
  });
});

describe('buildHistogramOption', () => {
  it('configures an accent-themed lineX brush with the button bar suppressed', () => {
    const opt = buildHistogramOption(bars, '#2dd4bf') as any;
    expect(opt.brush.brushType).toBe('lineX');
    // A hidden toolbox stops the brush component's default button bar from rendering.
    expect(opt.toolbox).toEqual({ show: false });
    expect(opt.brush.brushStyle.borderColor).toBe('rgba(45,212,191,0.5)');
    expect(opt.brush.brushStyle.color).toBe('rgba(45,212,191,0.1)');
  });

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
