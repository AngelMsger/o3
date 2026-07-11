import { describe, it, expect } from 'vitest';
import { displayKvValue, rowToPlainObject, type KV } from './logRow';

describe('displayKvValue', () => {
  it('quotes strings and levels, leaves numbers bare', () => {
    expect(displayKvValue({ k: 'name', v: 'alpha', kind: 'str' })).toBe('"alpha"');
    expect(displayKvValue({ k: 'level', v: 'warn', kind: 'lvl' })).toBe('"warn"');
    expect(displayKvValue({ k: 'count', v: '42', kind: 'num' })).toBe('42');
  });
});

describe('rowToPlainObject', () => {
  it('restores numeric types and does not double-escape strings', () => {
    const json: KV[] = [
      { k: 'name', v: 'alpha', kind: 'str' },
      { k: 'count', v: '42', kind: 'num' },
      { k: 'level', v: 'warn', kind: 'lvl' },
    ];
    const obj = rowToPlainObject(json);
    expect(obj).toEqual({ name: 'alpha', count: 42, level: 'warn' });
    // Serialized JSON is clean: number stays a number, string is single-quoted.
    expect(JSON.stringify(obj)).toBe('{"name":"alpha","count":42,"level":"warn"}');
  });

  it('keeps an unparseable numeric value as its raw text', () => {
    expect(rowToPlainObject([{ k: 'x', v: 'NaNish', kind: 'num' }])).toEqual({ x: 'NaNish' });
  });
});
