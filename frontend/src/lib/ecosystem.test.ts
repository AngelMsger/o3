import { describe, it, expect } from 'vitest';
import { dotState, ecoTooltip, cliPill, agentLabel } from './ecosystem';
import type { CLIStatus } from './ecosystem';

const base: CLIStatus = {
  installed: false, version: '', path: '', managed: '', latestVersion: '', updateAvailable: false,
};

describe('dotState', () => {
  it('off when not installed', () => {
    expect(dotState(base)).toBe('off');
  });
  it('update when an upgrade exists', () => {
    expect(dotState({ ...base, installed: true, version: '0.5.0', latestVersion: '0.6.0', updateAvailable: true })).toBe('update');
  });
  it('ok when installed and current', () => {
    expect(dotState({ ...base, installed: true, version: '0.6.0' })).toBe('ok');
  });
});

describe('ecoTooltip', () => {
  it('names the not-installed state', () => {
    expect(ecoTooltip(base)).toBe('openobserve-cli not installed');
  });
  it('shows the target version on update', () => {
    expect(ecoTooltip({ ...base, installed: true, version: '0.5.0', latestVersion: '0.6.0', updateAvailable: true }))
      .toBe('Update available: v0.5.0 -> v0.6.0');
  });
  it('confirms up to date', () => {
    expect(ecoTooltip({ ...base, installed: true, version: '0.6.0' })).toBe('openobserve-cli v0.6.0 - up to date');
  });
});

describe('cliPill', () => {
  it('not installed', () => expect(cliPill(base)).toEqual({ label: 'Not installed', tone: 'off' }));
  it('external takes precedence', () =>
    expect(cliPill({ ...base, installed: true, managed: 'external', updateAvailable: true }))
      .toEqual({ label: 'Installed - external', tone: 'ext' }));
  it('update available for npm', () =>
    expect(cliPill({ ...base, installed: true, managed: 'npm', updateAvailable: true }))
      .toEqual({ label: 'Update available', tone: 'update' }));
  it('installed and current', () =>
    expect(cliPill({ ...base, installed: true, managed: 'npm' }))
      .toEqual({ label: 'Installed', tone: 'ok' }));
});

describe('agentLabel', () => {
  it('maps known ids', () => {
    expect(agentLabel('claude-code')).toBe('Claude Code');
    expect(agentLabel('codex')).toBe('Codex');
  });
  it('falls back to the id', () => {
    expect(agentLabel('cursor')).toBe('cursor');
  });
});
