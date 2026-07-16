import { describe, it, expect } from 'vitest';
import { hexA, setFromStream, fromStream, computeSuggestions, addCondition, aggregateBy } from './format';
import type { Field } from '../types';

describe('hexA', () => {
  it('converts hex + alpha to rgba', () => {
    expect(hexA('#2dd4bf', 0.16)).toBe('rgba(45,212,191,0.16)');
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

describe('addCondition', () => {
  it('inserts a new WHERE before the ORDER BY / LIMIT tail', () => {
    const out = addCondition('SELECT *\nFROM "x"\nORDER BY t DESC\nLIMIT 100', 'svc', 'api', '=');
    expect(out).toBe('SELECT *\nFROM "x" WHERE svc = \'api\'\nORDER BY t DESC\nLIMIT 100');
  });
  it('appends with AND when a WHERE already exists', () => {
    const out = addCondition('SELECT * FROM "x" WHERE a = 1 ORDER BY t', 'svc', 'api', '!=');
    expect(out).toBe('SELECT * FROM "x" WHERE a = 1 AND svc != \'api\'\nORDER BY t');
  });
  it('appends a WHERE to a query with no tail clause', () => {
    expect(addCondition('SELECT * FROM "x"', 'svc', 'api', '=')).toBe('SELECT * FROM "x" WHERE svc = \'api\'');
  });
  it('leaves numeric values unquoted and escapes quotes in strings', () => {
    expect(addCondition('SELECT * FROM "x"', 'status', '200', '=')).toBe('SELECT * FROM "x" WHERE status = 200');
    expect(addCondition('SELECT * FROM "x"', 'msg', "o'brien", '=')).toBe('SELECT * FROM "x" WHERE msg = \'o\'\'brien\'');
  });
});

describe('aggregateBy', () => {
  it('builds a frequency query with the given limit', () => {
    expect(aggregateBy('logs', 'service', 10)).toBe('SELECT service, count(*) AS count\nFROM "logs"\nGROUP BY service\nORDER BY count DESC\nLIMIT 10');
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
