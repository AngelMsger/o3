import { describe, it, expect } from 'vitest';
import {
  checkState,
  assetLabel,
  versionLine,
  platformLine,
  publishedLabel,
  osLabel,
} from './update';
import type { UpdateResult, AppInfo } from './update';

function result(over: Partial<UpdateResult> = {}): UpdateResult {
  return {
    checked: true,
    currentVersion: '1.2.0',
    latestVersion: '1.3.0',
    updateAvailable: true,
    releaseName: 'o3 v1.3.0',
    notes: '## What’s Changed',
    publishedAt: '2026-07-14T10:00:00Z',
    releaseURL: 'https://github.com/AngelMsger/o3/releases/tag/v1.3.0',
    downloadURL: 'https://dl/dmg',
    assetName: 'o3-1.3.0-universal.dmg',
    os: 'darwin',
    arch: 'arm64',
    ...over,
  };
}

describe('checkState', () => {
  it('reports checking while a check is in flight, even with a stale result', () => {
    expect(checkState(null, true, '')).toBe('checking');
    expect(checkState(result(), true, '')).toBe('checking');
  });

  it('reports an error ahead of any stale result', () => {
    expect(checkState(result(), false, 'offline')).toBe('error');
  });

  it('reports idle before the first check', () => {
    expect(checkState(null, false, '')).toBe('idle');
  });

  // A dev build never contacts GitHub, so it comes back checked=false.
  it('reports dev for a local build', () => {
    expect(checkState(result({ checked: false, updateAvailable: false }), false, '')).toBe('dev');
  });

  it('distinguishes an available update from being up to date', () => {
    expect(checkState(result(), false, '')).toBe('available');
    expect(checkState(result({ updateAvailable: false }), false, '')).toBe('current');
  });

  // The repo publishes drafts, so /releases/latest can legitimately return
  // nothing. That is "current", not an error.
  it('treats a repo with no published release as up to date', () => {
    const none = result({ updateAvailable: false, latestVersion: '', downloadURL: '' });
    expect(checkState(none, false, '')).toBe('current');
  });
});

describe('assetLabel', () => {
  it('names the platform when an artifact matched', () => {
    expect(assetLabel(result())).toBe('Download For macOS');
    expect(assetLabel(result({ os: 'windows' }))).toBe('Download For Windows');
    expect(assetLabel(result({ os: 'linux' }))).toBe('Download For Linux');
  });

  // No asset for this platform: the backend falls back to the release page, and
  // the button must not promise a download.
  it('offers the release page when nothing matched', () => {
    expect(assetLabel(result({ assetName: '' }))).toBe('Open Release Page');
  });
});

describe('versionLine', () => {
  it('names both versions', () => {
    expect(versionLine(result())).toBe('o3 1.3.0 is available — you have 1.2.0');
  });
});

describe('platformLine', () => {
  const info = (over: Partial<AppInfo> = {}): AppInfo => ({
    version: '1.2.0',
    os: 'darwin',
    arch: 'arm64',
    wails: 'v2.12.0',
    isDev: false,
    ...over,
  });

  it('renders the release build line', () => {
    expect(platformLine(info())).toBe('v1.2.0 · Wails v2.12.0 · macOS arm64');
  });

  it('says "dev build" rather than "vdev"', () => {
    expect(platformLine(info({ version: 'dev', isDev: true }))).toBe(
      'dev build · Wails v2.12.0 · macOS arm64',
    );
  });

  it('renders the real platform on windows and linux', () => {
    expect(platformLine(info({ os: 'windows', arch: 'amd64' }))).toBe(
      'v1.2.0 · Wails v2.12.0 · Windows amd64',
    );
  });

  it('is empty before AppInfo loads', () => {
    expect(platformLine(null)).toBe('');
  });
});

describe('osLabel', () => {
  it('passes an unknown GOOS through unchanged', () => {
    expect(osLabel('freebsd')).toBe('freebsd');
  });
});

describe('publishedLabel', () => {
  it('formats a release date', () => {
    expect(publishedLabel('2026-07-14T10:00:00Z')).not.toBe('');
  });

  it('is empty for a missing or unparseable date, so the caller can omit it', () => {
    expect(publishedLabel('')).toBe('');
    expect(publishedLabel('not a date')).toBe('');
  });
});
