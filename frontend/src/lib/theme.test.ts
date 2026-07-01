import { describe, it, expect } from 'vitest';
import { effectiveTheme } from './theme';

describe('effectiveTheme', () => {
  it('returns the explicit pref for light/dark', () => {
    expect(effectiveTheme('dark', true)).toBe('dark');
    expect(effectiveTheme('dark', false)).toBe('dark');
    expect(effectiveTheme('light', true)).toBe('light');
  });
  it('follows systemDark when pref is system', () => {
    expect(effectiveTheme('system', true)).toBe('dark');
    expect(effectiveTheme('system', false)).toBe('light');
  });
});
