import type { ThemePref } from '../types';

/** Resolve the pref to a concrete theme: 'system' follows the OS. */
export function effectiveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark' {
  if (pref === 'system') return systemDark ? 'dark' : 'light';
  return pref;
}

/** Apply the concrete theme to the document root (drives the CSS token set). */
export function applyThemeAttr(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-oo-theme', theme);
}
