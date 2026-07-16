import { describe, it, expect } from 'vitest';
import { relativeRange, rangeToMicros, rangeLabel, parseAbsolute, type TimeRange } from './timeRange';

// A fixed "now" so relative math is deterministic: 2026-06-25T00:00:00Z.
const NOW_MS = Date.UTC(2026, 5, 25, 0, 0, 0);

describe('relativeRange', () => {
  it('clamps a bad amount and a bad unit independently', () => {
    expect(relativeRange(NaN, 'x')).toEqual({ kind: 'relative', amount: 15, unit: 'm' });
    expect(relativeRange(-5, 'h')).toEqual({ kind: 'relative', amount: 15, unit: 'h' }); // unit kept
    expect(relativeRange(7, 'd')).toEqual({ kind: 'relative', amount: 7, unit: 'd' });
  });
});

describe('rangeToMicros', () => {
  it('relative window is amount*unit before now', () => {
    const { startMicros, endMicros } = rangeToMicros(relativeRange(7, 'd'), NOW_MS);
    expect(endMicros).toBe(NOW_MS * 1000);
    expect(endMicros - startMicros).toBe(7 * 86400e6); // 7 days in micros
  });

  it('different units actually change the span (regression: picker was ignored)', () => {
    const min15 = rangeToMicros(relativeRange(15, 'm'), NOW_MS);
    const days7 = rangeToMicros(relativeRange(7, 'd'), NOW_MS);
    expect(days7.endMicros - days7.startMicros).not.toBe(min15.endMicros - min15.startMicros);
  });

  it('absolute window uses the given bounds verbatim', () => {
    const r = parseAbsolute('2026-06-24 08:00:00', '2026-06-24 09:00:00')!;
    const range: TimeRange = { kind: 'absolute', ...r };
    const { startMicros, endMicros } = rangeToMicros(range, NOW_MS);
    expect(endMicros - startMicros).toBe(3600e6); // exactly one hour, ignoring "now"
  });
});

describe('parseAbsolute', () => {
  it('interprets wall-clock as Asia/Shanghai (UTC+8)', () => {
    const r = parseAbsolute('2026-06-25 08:00:00', '2026-06-25 09:00')!;
    // 08:00 Shanghai == 00:00Z
    expect(r.fromMs).toBe(Date.UTC(2026, 5, 25, 0, 0, 0));
    expect(r.toMs).toBe(Date.UTC(2026, 5, 25, 1, 0, 0));
  });

  it('rejects malformed or inverted ranges', () => {
    expect(parseAbsolute('nonsense', '2026-06-25 09:00:00')).toBeNull();
    expect(parseAbsolute('2026-02-30 08:00:00', '2026-03-01 09:00:00')).toBeNull();
    expect(parseAbsolute('2026-06-25 24:00:00', '2026-06-26 01:00:00')).toBeNull();
    expect(parseAbsolute('2026-06-25 09:00:00', '2026-06-25 08:00:00')).toBeNull();
    expect(parseAbsolute('2026-06-25 09:00:00', '2026-06-25 09:00:00')).toBeNull();
  });
});

describe('rangeLabel', () => {
  it('labels relative ranges with pluralization', () => {
    expect(rangeLabel(relativeRange(1, 'h'))).toBe('Past 1 Hour');
    expect(rangeLabel(relativeRange(7, 'd'))).toBe('Past 7 Days');
  });
  it('labels absolute ranges as a Shanghai wall-clock span', () => {
    const r = parseAbsolute('2026-06-25 08:00:00', '2026-06-25 09:00:00')!;
    expect(rangeLabel({ kind: 'absolute', ...r })).toBe('2026-06-25 08:00 — 2026-06-25 09:00');
  });
});
