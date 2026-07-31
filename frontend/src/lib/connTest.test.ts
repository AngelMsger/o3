import { describe, it, expect } from 'vitest';
import { IDLE, connTestLabel, type ConnTest } from './connTest';

describe('connTestLabel', () => {
  // The Settings "Test Connection" button reported NOTHING: it called the
  // backend but the outcome landed in state only the Setup Wizard rendered, so
  // clicking it looked like a dead button. Both surfaces now render this label.
  it('says nothing at rest', () => {
    expect(connTestLabel(IDLE)).toBe('');
  });

  it('acknowledges the click while the request is in flight', () => {
    expect(connTestLabel({ state: 'testing' })).toBe('Testing…');
  });

  it('reports what the instance answered with', () => {
    expect(connTestLabel({ state: 'ok', orgCount: 1, streamCount: 12 }))
      .toBe('✓ reachable · 1 org, 12 log streams');
  });

  it('pluralises both counts', () => {
    expect(connTestLabel({ state: 'ok', orgCount: 3, streamCount: 1 }))
      .toBe('✓ reachable · 3 orgs, 1 log stream');
  });

  it('still confirms reachability when the instance has no streams yet', () => {
    expect(connTestLabel({ state: 'ok', orgCount: 1, streamCount: 0 }))
      .toBe('✓ reachable · 1 org, 0 log streams');
  });

  it('surfaces the failure message verbatim', () => {
    const t: ConnTest = { state: 'error', message: 'no stored credential' };
    expect(connTestLabel(t)).toBe('no stored credential');
  });

  // The hint is longer guidance, rendered on its own line beneath the label
  // rather than crammed into the one-liner beside the button.
  it('keeps the hint out of the one-line label', () => {
    const t: ConnTest = {
      state: 'error',
      message: "the server's TLS certificate is not trusted",
      hint: 'o3 does not support self-signed certificates.',
    };
    expect(connTestLabel(t)).toBe("the server's TLS certificate is not trusted");
  });
});
