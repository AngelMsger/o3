import { describe, it, expect } from 'vitest';
import { filterStreams } from './streams';

const S = [{ name: 'nginx_access' }, { name: 'app_logs' }, { name: 'AUTH_events' }];

describe('filterStreams', () => {
  it('empty query returns all', () => {
    expect(filterStreams(S, '')).toHaveLength(3);
    expect(filterStreams(S, '   ')).toHaveLength(3);
  });
  it('case-insensitive substring match', () => {
    expect(filterStreams(S, 'AUTH').map((s) => s.name)).toEqual(['AUTH_events']);
    expect(filterStreams(S, 'log').map((s) => s.name)).toEqual(['app_logs']);
    expect(filterStreams(S, 'A').map((s) => s.name)).toEqual(['nginx_access', 'app_logs', 'AUTH_events']);
  });
  it('no match returns empty', () => {
    expect(filterStreams(S, 'zzz')).toEqual([]);
  });
});
