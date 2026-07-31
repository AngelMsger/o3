import { describe, it, expect } from 'vitest';
import { EMPTY_RESULT, forgetResult, recallResult, rememberResult, type TabResult } from './tabResults';
import type { LogRow } from '../types';

const row = (id: string): LogRow => ({ id } as LogRow);

const result = (rows: LogRow[], total: number): TabResult => ({
  ...EMPTY_RESULT,
  rows,
  meta: { total, tookMs: 12, shown: rows.length },
});

describe('tab result retention', () => {
  // Switching tabs used to wipe the global result state, because results were
  // not per-tab: leaving a tab and coming back showed an empty table and the
  // query had to be re-run. Results now belong to the tab that produced them.
  it('gives a tab back the results it had before the switch', () => {
    const a = result([row('r1'), row('r2')], 2);
    const store = rememberResult({}, 't1', a);
    expect(recallResult(store, 't1')).toEqual(a);
  });

  it('keeps each tab′s results apart', () => {
    const a = result([row('r1')], 1);
    const b = result([row('r9'), row('r8')], 2);
    let store = rememberResult({}, 't1', a);
    store = rememberResult(store, 't2', b);
    expect(recallResult(store, 't1')).toEqual(a);
    expect(recallResult(store, 't2')).toEqual(b);
  });

  it('shows a never-run tab an empty result rather than the last tab′s rows', () => {
    const store = rememberResult({}, 't1', result([row('r1')], 1));
    expect(recallResult(store, 't-new-1')).toEqual(EMPTY_RESULT);
  });

  it('overwrites a tab′s results when it is re-run', () => {
    const first = result([row('r1')], 1);
    const second = result([row('r2'), row('r3')], 2);
    let store = rememberResult({}, 't1', first);
    store = rememberResult(store, 't1', second);
    expect(recallResult(store, 't1')).toEqual(second);
  });

  it('forgets a closed tab, so a recycled id cannot inherit stale rows', () => {
    let store = rememberResult({}, 't1', result([row('r1')], 1));
    store = forgetResult(store, 't1');
    expect(recallResult(store, 't1')).toEqual(EMPTY_RESULT);
  });

  it('leaves other tabs alone when one is closed', () => {
    const b = result([row('r9')], 1);
    let store = rememberResult({}, 't1', result([row('r1')], 1));
    store = rememberResult(store, 't2', b);
    store = forgetResult(store, 't1');
    expect(recallResult(store, 't2')).toEqual(b);
  });

  it('does not mutate the store it is given', () => {
    const store = rememberResult({}, 't1', result([row('r1')], 1));
    const snapshot = { ...store };
    rememberResult(store, 't2', result([row('r2')], 1));
    forgetResult(store, 't1');
    expect(store).toEqual(snapshot);
  });
});
