import type { Field, HistoBar, Suggestion } from '../types';
import { KEYWORDS, FUNCS } from '../data/mock';

/**
 * Convert a hex color + alpha to an rgba() string.
 * Design lines 827-830.
 * Example: hexA('#2dd4bf', 0.16) => 'rgba(45,212,191,0.16)'
 */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;
}

const FROM_RE = /\bfrom\s+"?([\w.-]+)"?/i;

// fromStream returns the first FROM table name (unquoted), or '' when absent.
export function fromStream(sql: string): string {
  const m = sql.match(FROM_RE);
  return m ? m[1] : '';
}

// setFromStream points a query at a stream: it seeds a default query for an
// empty buffer, replaces an existing FROM table, or (for a non-empty buffer
// with no FROM) leaves the text unchanged.
export function setFromStream(sql: string, stream: string): string {
  if (!sql.trim()) {
    return `SELECT *\nFROM "${stream}"\nORDER BY _timestamp DESC\nLIMIT 100`;
  }
  if (FROM_RE.test(sql)) {
    return sql.replace(FROM_RE, `FROM "${stream}"`);
  }
  return sql;
}

const TAIL_RE = /\b(group\s+by|order\s+by|having|limit)\b/i;

// addCondition injects `field <op> value` into a query's WHERE clause: it appends
// with AND when a WHERE already exists, otherwise inserts a new WHERE before any
// GROUP BY / ORDER BY / HAVING / LIMIT tail. Numeric values are left unquoted;
// strings are single-quoted with '' escaping. Used by the value-action menu.
export function addCondition(sql: string, field: string, value: string, op: '=' | '!='): string {
  const lit = /^-?\d+(\.\d+)?$/.test(value) ? value : `'${value.replace(/'/g, "''")}'`;
  const cond = `${field} ${op} ${lit}`;
  const m = sql.match(TAIL_RE);
  const splitAt = m ? m.index! : sql.length;
  const head = sql.slice(0, splitAt).trimEnd();
  const tail = sql.slice(splitAt);
  const newHead = /\bwhere\b/i.test(head) ? `${head} AND ${cond}` : `${head} WHERE ${cond}`;
  return tail ? `${newHead}\n${tail}` : newHead;
}

// aggregateBy rewrites the query to count occurrences of one field, ordered by
// frequency. limit caps the rows (e.g. 10 for "Top 10 values"). Powers the
// value-action menu's "Group by" / "Top N" actions.
export function aggregateBy(stream: string, field: string, limit: number): string {
  return `SELECT ${field}, count(*) AS count\nFROM "${stream}"\nGROUP BY ${field}\nORDER BY count DESC\nLIMIT ${limit}`;
}

/**
 * Compute autocomplete suggestions for a given word prefix.
 * Ported from design lines 868-877.
 * Returns up to 8 matches across keywords (K/#ff7b9c), functions (ƒ/#7dd3fc), fields (·/#a3e08c).
 * Takes a live fields parameter instead of the mock FIELDS constant.
 */
export function computeSuggestions(word: string, fields: Field[]): Suggestion[] {
  const w = word.toLowerCase();
  if (!w) return [];
  const out: Suggestion[] = [];
  KEYWORDS.forEach((k) => {
    if (k.toLowerCase().startsWith(w)) out.push({ label: k, kind: 'keyword', tag: 'K', detail: 'keyword', color: '#ff7b9c' });
  });
  FUNCS.forEach((f) => {
    if (f[0].toLowerCase().startsWith(w)) out.push({ label: f[0], kind: 'function', tag: 'ƒ', detail: f[1], color: '#7dd3fc' });
  });
  fields.forEach((f) => {
    if (f.name.toLowerCase().startsWith(w)) out.push({ label: f.name, kind: 'field', tag: '·', detail: f.type, color: '#a3e08c' });
  });
  return out.slice(0, 8);
}
