import { describe, it, expect } from 'vitest';
import { hexA, histogramBars, highlight } from './format';

describe('hexA', () => {
  it('converts hex + alpha to rgba', () => {
    expect(hexA('#2dd4bf', 0.16)).toBe('rgba(45,212,191,0.16)');
  });
});

describe('histogramBars', () => {
  it('is deterministic and returns 66 normalized bars', () => {
    const a = histogramBars(), b = histogramBars();
    expect(a).toHaveLength(66);
    expect(a).toEqual(b);
    expect(Math.max(...a.map(x => x.h))).toBeLessThanOrEqual(1);
    expect(Math.min(...a.map(x => x.h))).toBeGreaterThan(0);
  });
});

describe('highlight', () => {
  it('colors SQL keywords distinctly from identifiers', () => {
    const parts = highlight('SELECT body FROM demo_logs');
    const kw = parts.find(p => p.txt === 'SELECT');
    const id = parts.find(p => p.txt === 'demo_logs');
    expect(kw).toBeDefined();
    expect(id).toBeDefined();
    expect(kw!.color).not.toBe(id!.color);
  });
});
