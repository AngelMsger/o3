import { describe, it, expect } from 'vitest';
import { createLatest } from './latest';

describe('createLatest', () => {
  it('only the newest token is current', () => {
    const l = createLatest();
    const a = l.begin();
    const b = l.begin();
    expect(l.isCurrent(a)).toBe(false); // superseded
    expect(l.isCurrent(b)).toBe(true);
  });

  it('models the race: slower older request must not win', () => {
    const l = createLatest();
    const first = l.begin(); // user runs query 1
    const second = l.begin(); // user quickly runs query 2
    // query 1 resolves last — it should be dropped.
    expect(l.isCurrent(first)).toBe(false);
    // query 2 resolves — it is applied.
    expect(l.isCurrent(second)).toBe(true);
  });

  it('invalidate discards everything in flight (context/tab switch)', () => {
    const l = createLatest();
    const token = l.begin();
    l.invalidate();
    expect(l.isCurrent(token)).toBe(false);
  });
});
