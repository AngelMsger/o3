import { describe, it, expect } from 'vitest';
import { expiryLabel, authTabToScheme, schemeToAuthTab } from './signin';

describe('expiryLabel', () => {
  const now = Date.UTC(2026, 6, 1); // 2026-07-01

  it('renders a future expiry in days', () => {
    const in29 = new Date(now + 29 * 86_400_000).toISOString();
    expect(expiryLabel(in29, now)).toBe('in 29 days');
  });
  it('renders a single day', () => {
    const in1 = new Date(now + 1 * 86_400_000).toISOString();
    expect(expiryLabel(in1, now)).toBe('in 1 day');
  });
  it('reports an elapsed expiry', () => {
    const past = new Date(now - 86_400_000).toISOString();
    expect(expiryLabel(past, now)).toBe('expired');
  });
  it('degrades gracefully with no expiry', () => {
    expect(expiryLabel('', now)).toBe('until you sign out');
    expect(expiryLabel('not-a-date', now)).toBe('until you sign out');
  });
});

describe('auth scheme <-> tab mapping', () => {
  it('maps tabs to schemes', () => {
    expect(authTabToScheme('session')).toBe('session');
    expect(authTabToScheme('token')).toBe('token');
    expect(authTabToScheme('sso')).toBe('sso');
    expect(authTabToScheme('password')).toBe('basic');
  });
  it('maps schemes back to tabs', () => {
    expect(schemeToAuthTab('session')).toBe('session');
    expect(schemeToAuthTab('token')).toBe('token');
    expect(schemeToAuthTab('sso')).toBe('sso');
    expect(schemeToAuthTab('basic')).toBe('password');
    expect(schemeToAuthTab('')).toBe('password');
  });
});
