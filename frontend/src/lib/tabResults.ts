// Per-tab query results.
//
// Results used to be a single set of state shared by every tab, so selectTab had
// to wipe them on every switch — otherwise the tab you moved to would show the
// rows of the tab you left. The cost was that leaving a tab and coming back
// silently threw its results away and the query had to be re-run.
//
// Results belong to the tab that produced them. This store keeps one snapshot
// per tab id; App saves the outgoing tab's view on switch and restores the
// incoming tab's. Kept pure so the retention rules are unit-tested.
import type { HistoBucket, LogRow } from '../types';

// HistoSelection is the histogram drag-to-select sub-window, part of the view a
// tab should get back — re-selecting it by hand after every switch is exactly
// the kind of lost work this store exists to prevent.
export interface HistoSelection {
  lo: number;
  hi: number;
  startMicros: number;
  endMicros: number;
  label: string;
}

export interface TabResult {
  rows: LogRow[];
  bars: HistoBucket[];
  meta: { total: number; tookMs: number; shown: number };
  error: { message: string; hint: string } | null;
  page: number;
  histoSel: HistoSelection | null;
}

// EMPTY_RESULT is what a tab that has never run a query shows.
export const EMPTY_RESULT: TabResult = {
  rows: [],
  bars: [],
  meta: { total: 0, tookMs: 0, shown: 0 },
  error: null,
  page: 1,
  histoSel: null,
};

export type TabResults = Record<string, TabResult>;

// rememberResult stores (or replaces) one tab's results, returning a new store.
export function rememberResult(store: TabResults, id: string, result: TabResult): TabResults {
  return { ...store, [id]: result };
}

// recallResult returns a tab's stored results, or EMPTY_RESULT when it has none
// — never another tab's rows.
export function recallResult(store: TabResults, id: string): TabResult {
  return store[id] ?? EMPTY_RESULT;
}

// forgetResult drops a closed tab's results so a recycled id cannot inherit them.
export function forgetResult(store: TabResults, id: string): TabResults {
  if (!(id in store)) return store;
  const next = { ...store };
  delete next[id];
  return next;
}
