import type { HistoBar } from '../types';

// Keywords and functions mirrored from the design script (lines 694-699) for the highlight tokenizer.
const KEYWORDS = new Set([
  'select','from','where','and','or','not','in','like','ilike','order','by','group',
  'limit','offset','as','on','join','left','inner','having','distinct','asc','desc',
  'between','is','null','case','when','then','else','end','union','match_all'
]);
const FUNCS = new Set([
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
 * Generate 66 deterministic, normalized histogram bars.
 * Seeding formula from design lines 904-906; normalize by max.
 */
export function histogramBars(): HistoBar[] {
  const seeds: number[] = [];
  for (let i = 0; i < 66; i++) {
    const v = 0.35 + 0.45 * Math.abs(Math.sin(i * 1.3) + Math.cos(i * 0.7)) / 2
      + (i % 11 === 0 ? 0.4 : 0)
      + (i % 7 === 0 ? 0.15 : 0);
    seeds.push(v);
  }
  const mx = Math.max(...seeds);
  return seeds.map(v => ({ h: v / mx }));
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
      if (KEYWORDS.has(lw)) color = '#ff7b9c';
      else if (FUNCS.has(lw) && rest) color = '#7dd3fc';
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
