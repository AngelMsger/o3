// Helpers for a log row's expanded key/values. The backend now sends KV.v as the
// RAW field value (no display quotes) with KV.kind carrying the type, so:
//   - the drawer adds quotes only for display,
//   - Copy JSON reconstructs real typed values, and
//   - the value-action menu feeds the unquoted value straight to the SQL builder.

export interface KV {
  k: string;
  v: string;
  kind: 'str' | 'num' | 'lvl';
}

// displayKvValue renders a value for the inspector: strings/levels are quoted,
// numbers are shown bare — matching how the value reads as JSON.
export function displayKvValue(kv: KV): string {
  return kv.kind === 'num' ? kv.v : `"${kv.v}"`;
}

// rowToPlainObject reconstructs a plain object for "Copy JSON", restoring numeric
// types so numbers serialize as numbers (not strings) and strings are not
// double-escaped. A numeric value that does not parse degrades to its raw text.
export function rowToPlainObject(json: KV[]): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const kv of json) {
    if (kv.kind === 'num') {
      const n = Number(kv.v);
      out[kv.k] = Number.isNaN(n) ? kv.v : n;
    } else {
      out[kv.k] = kv.v;
    }
  }
  return out;
}
