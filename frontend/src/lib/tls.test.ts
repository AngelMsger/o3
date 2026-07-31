import { describe, expect, it } from 'vitest';
import { usesTLS } from './tls';

describe('usesTLS', () => {
  it('is true for an https URL', () => {
    expect(usesTLS('https://o2.example.com')).toBe(true);
  });

  it('is false for an http URL', () => {
    expect(usesTLS('http://localhost:5080')).toBe(false);
  });

  // normalizeURL in app.go prepends https:// to a scheme-less URL, so a user who
  // types a bare host is on TLS whether or not they said so.
  it('is true for a scheme-less host, matching the backend default', () => {
    expect(usesTLS('o2.internal:5080')).toBe(true);
    expect(usesTLS('o2.internal')).toBe(true);
  });

  it('ignores case and surrounding whitespace', () => {
    expect(usesTLS('  HTTPS://O2.EXAMPLE.COM  ')).toBe(true);
    expect(usesTLS('  HTTP://localhost  ')).toBe(false);
  });

  // Nothing typed yet is not a TLS decision — the wizard should stay quiet
  // rather than warn about a certificate for a server the user has not named.
  it('is false for an empty URL', () => {
    expect(usesTLS('')).toBe(false);
    expect(usesTLS('   ')).toBe(false);
  });
});
