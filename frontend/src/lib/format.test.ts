import { describe, it, expect } from 'vitest';
import { hexA, histogramBars, highlight, setFromStream, fromStream, wordBeforeCaret, computeSuggestions } from './format';
import type { Field } from '../types';

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

describe('fromStream', () => {
  it('extracts an unquoted FROM table', () => {
    expect(fromStream('SELECT * FROM nginx_access WHERE a=1')).toBe('nginx_access');
  });
  it('extracts a quoted FROM table', () => {
    expect(fromStream('select * from "demo_logs" order by t')).toBe('demo_logs');
  });
  it('returns empty when no FROM', () => {
    expect(fromStream('SELECT 1')).toBe('');
  });
});

describe('setFromStream', () => {
  it('seeds a full query when the buffer is empty', () => {
    expect(setFromStream('   ', 'logs')).toBe('SELECT *\nFROM "logs"\nORDER BY _timestamp DESC\nLIMIT 100');
  });
  it('replaces an existing FROM table (quoting the new name)', () => {
    expect(setFromStream('SELECT * FROM old WHERE a=1', 'newone')).toBe('SELECT * FROM "newone" WHERE a=1');
  });
  it('replaces a quoted FROM table', () => {
    expect(setFromStream('SELECT * FROM "old" ORDER BY t', 'n2')).toBe('SELECT * FROM "n2" ORDER BY t');
  });
  it('leaves a non-empty buffer without FROM unchanged', () => {
    expect(setFromStream('SELECT 1', 'logs')).toBe('SELECT 1');
  });
});

describe('wordBeforeCaret', () => {
  it('returns the token ending at the caret', () => {
    expect(wordBeforeCaret('SELECT ser', 10)).toBe('ser');
  });
  it('includes dotted identifiers', () => {
    // 'WHERE k8s.name'.slice(0, 13) === 'WHERE k8s.nam', so token is 'k8s.nam'
    expect(wordBeforeCaret('WHERE k8s.name', 13)).toBe('k8s.nam');
  });
  it('returns empty after a space', () => {
    expect(wordBeforeCaret('SELECT ', 7)).toBe('');
  });
});

describe('computeSuggestions', () => {
  const fields: Field[] = [{ name: 'service_name', type: 'string' }, { name: 'severity', type: 'string' }];
  it('matches live fields, keywords, and functions by prefix', () => {
    const out = computeSuggestions('se', fields);
    const labels = out.map(s => s.label);
    expect(labels).toContain('service_name');
    expect(labels).toContain('severity');
    expect(labels).toContain('SELECT'); // a KEYWORD starting with se (case-insensitive)
  });
  it('returns nothing for an empty word', () => {
    expect(computeSuggestions('', fields)).toEqual([]);
  });
  it('caps results at 8', () => {
    const many: Field[] = Array.from({ length: 20 }, (_, i) => ({ name: `sfield${i}`, type: 'string' }));
    expect(computeSuggestions('s', many).length).toBe(8);
  });
});
