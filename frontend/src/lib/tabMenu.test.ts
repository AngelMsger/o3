import { describe, it, expect } from 'vitest';
import { buildTabMenu } from './tabMenu';
import type { TabMenuItem } from './tabMenu';

const items = (count: number, index: number) =>
  buildTabMenu(count, index).filter((e): e is TabMenuItem => e !== 'sep');

describe('buildTabMenu', () => {
  it('single tab: only Close All enabled', () => {
    const m = Object.fromEntries(items(1, 0).map((i) => [i.action, i.enabled]));
    expect(m).toEqual({ close: false, closeLeft: false, closeRight: false, closeOthers: false, closeAll: true });
  });
  it('middle of three: everything enabled', () => {
    const m = Object.fromEntries(items(3, 1).map((i) => [i.action, i.enabled]));
    expect(m).toEqual({ close: true, closeLeft: true, closeRight: true, closeOthers: true, closeAll: true });
  });
  it('first of three: no close-left', () => {
    const m = Object.fromEntries(items(3, 0).map((i) => [i.action, i.enabled]));
    expect(m.closeLeft).toBe(false);
    expect(m.closeRight).toBe(true);
  });
  it('last of three: no close-right', () => {
    const m = Object.fromEntries(items(3, 2).map((i) => [i.action, i.enabled]));
    expect(m.closeLeft).toBe(true);
    expect(m.closeRight).toBe(false);
  });
  it('has two separators in order', () => {
    const seq = buildTabMenu(3, 1).map((e) => (e === 'sep' ? 'sep' : e.action));
    expect(seq).toEqual(['close', 'sep', 'closeLeft', 'closeRight', 'closeOthers', 'sep', 'closeAll']);
  });
});
