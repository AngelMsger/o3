import { describe, it, expect } from 'vitest';
import { filterStreams, pickStream } from './streams';

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

describe('pickStream', () => {
  it('restores the remembered stream when the server still lists it', () => {
    expect(pickStream(S, 'app_logs')).toBe('app_logs');
  });
  it('falls back to the first stream when nothing is remembered', () => {
    expect(pickStream(S, undefined)).toBe('nginx_access');
    expect(pickStream(S, '')).toBe('nginx_access');
  });
  // A stream can be deleted server-side, or the memory can belong to a context
  // that no longer has it. Restoring a name that is gone would leave the picker
  // pointing at a stream every query then fails on.
  it('falls back to the first stream when the remembered one is gone', () => {
    expect(pickStream(S, 'deleted_stream')).toBe('nginx_access');
  });
  it('matches exactly, not case-insensitively', () => {
    expect(pickStream(S, 'APP_LOGS')).toBe('nginx_access');
  });
  it('returns empty for an empty list', () => {
    expect(pickStream([], 'app_logs')).toBe('');
  });
});
