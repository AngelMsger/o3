import type { Field, HistoBar, Suggestion } from '../types';
import { KEYWORDS, FUNCS } from '../data/mock';

// Keywords and functions mirrored from the design script (lines 694-699) for the highlight tokenizer.
const KW_SET = new Set([
  'select','from','where','and','or','not','in','like','ilike','order','by','group',
  'limit','offset','as','on','join','left','inner','having','distinct','asc','desc',
  'between','is','null','case','when','then','else','end','union','match_all'
]);
const FN_SET = new Set([
  'count','histogram','approx_count_distinct','min','max','avg','sum',
  'str_match','re_match','date_bin','to_timestamp','coalesce','lower','upper'
]);

/**
 * Convert a hex color + alpha to an rgba() string.
 * Design lines 827-830.
 * Example: hexA('#2dd4bf', 0.16) => 'rgba(45,212,191,0.16)'
 */
export function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`;
}

/**
 * Generate 66 deterministic histogram bars.
 * Seeding formula from design lines 904-906; clamp each value to [0, 1].
 */
export function histogramBars(): HistoBar[] {
  const seeds: number[] = [];
  for (let i = 0; i < 66; i++) {
    const v = 0.35 + 0.45 * Math.abs(Math.sin(i * 1.3) + Math.cos(i * 0.7)) / 2
      + (i % 11 === 0 ? 0.4 : 0)
      + (i % 7 === 0 ? 0.15 : 0);
    seeds.push(Math.min(1, v));
  }
  return seeds.map(v => ({ h: v }));
}

/**
 * Tokenize a SQL string into colored spans.
 * Design lines 879-899.
 * Returns an array of { txt, color } — no React elements (pure).
 */
export function highlight(sql: string): { txt: string; color: string }[] {
  const re = /('(?:[^']|'')*'|"[^"]*")|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\s])/g;
  const parts: { txt: string; color: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql))) {
    let color = '#cfd6e4';
    const txt = m[0];
    if (m[1]) {
      color = '#a3e08c';
    } else if (m[2]) {
      color = '#f6c177';
    } else if (m[3]) {
      const lw = m[3].toLowerCase();
      const rest = sql.slice(re.lastIndex).match(/^\s*\(/);
      if (KW_SET.has(lw)) color = '#ff7b9c';
      else if (FN_SET.has(lw) && rest) color = '#7dd3fc';
      else color = '#cfd6e4';
    } else if (m[5]) {
      color = '#7b8496';
    }
    parts.push({ txt, color });
  }
  return parts;
}

/**
 * Format an absolute datetime string by slicing characters 5-16.
 * Design line 997: const fmt = (s) => (s || '').slice(5, 16)
 * Example: '2026-06-25 13:00:00' => '06-25 13:00'
 */
export function fmtAbs(s: string): string {
  return (s || '').slice(5, 16);
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

// wordBeforeCaret returns the identifier token ending at the caret ('' if none).
export function wordBeforeCaret(text: string, caret: number): string {
  const left = text.slice(0, caret);
  const m = left.match(/[\w.]+$/);
  return m ? m[0] : '';
}

/**
 * Compute autocomplete suggestions for a given word prefix.
 * Ported from design lines 868-877.
 * Returns up to 8 matches across keywords (K/#ff7b9c), functions (f/#7dd3fc), fields (·/#a3e08c).
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
