// Pure helpers for browser sign-in UI, kept out of the React components so they
// can be unit-tested without a DOM (matching the repo's pure-logic test style).

// CapturedSession mirrors the Go SessionResult returned by BrowserSignIn.
export interface CapturedSession {
  email: string;
  org: string;
  secret: string;
  host: string;
  expiresAt: string; // RFC3339, or "" when unknown
}

// expiryLabel renders a session's expiry as a human phrase for the connection
// card ("in 29 days"). An empty/unparseable/past value degrades gracefully.
// `now` is injectable for deterministic tests.
export function expiryLabel(iso: string, now: number = Date.now()): string {
  if (!iso) return 'until you sign out';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 'until you sign out';
  const days = Math.ceil((t - now) / 86_400_000);
  if (days <= 0) return 'expired';
  if (days === 1) return 'in 1 day';
  return `in ${days} days`;
}

// SignInStep is the browser sign-in overlay's flow state.
export type SignInStep = 'login' | 'consent' | 'done' | 'error';

// authTabToScheme maps a UI auth tab id to the backend auth scheme.
export function authTabToScheme(tab: string): string {
  switch (tab) {
    case 'session':
      return 'session';
    case 'token':
      return 'token';
    case 'sso':
      return 'sso';
    default:
      return 'basic';
  }
}

// schemeToAuthTab maps a backend auth scheme to its UI auth tab id.
export function schemeToAuthTab(scheme: string): 'session' | 'password' | 'token' | 'sso' {
  switch (scheme) {
    case 'session':
      return 'session';
    case 'token':
      return 'token';
    case 'sso':
      return 'sso';
    default:
      return 'password';
  }
}
