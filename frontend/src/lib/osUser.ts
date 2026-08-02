// Title-bar avatar identity, derived from the OS account name.
//
// The design mock carried a hardcoded "JD" (design Observe.dc.html title bar);
// the refresh replaces it with the real system account, so the avatar means
// something on a machine that is not the designer's. The backend supplies the
// login name (AppInfo.user); everything here is presentation and stays pure so
// it is unit-tested without a DOM.
//
// Account names come in every shape — `alex`, `alex.chen`, `alex-chen`,
// `alex_chen`, `Alex Chen` — so the separators are treated interchangeably.

// userParts splits an account name into its word parts, dropping empties.
export function userParts(user: string): string[] {
  return String(user ?? '').split(/[.\-_\s]+/).filter(Boolean);
}

// userInitials renders the two-letter avatar label: first letters of the first
// two parts when the name is compound, otherwise the first two characters.
// Falls back to "?" rather than rendering an empty circle.
export function userInitials(user: string): string {
  const p = userParts(user);
  if (p.length === 0) return '?';
  const s = p.length > 1 ? p[0][0] + p[1][0] : p[0].slice(0, 2);
  return s.toUpperCase();
}

// userDisplay renders the account name in Pascal case for the hover title
// ("alex.chen" -> "Alex Chen").
export function userDisplay(user: string): string {
  const p = userParts(user);
  if (p.length === 0) return 'Unknown';
  return p.map((x) => x[0].toUpperCase() + x.slice(1)).join(' ');
}

// userTitle is the avatar's full tooltip: the readable name plus the raw login
// it came from, so it is clear this is the OS account and not an OpenObserve
// identity (the context's own credentials live in Settings).
export function userTitle(user: string): string {
  const raw = String(user ?? '').trim();
  if (!raw) return 'Signed in to this machine';
  return `${userDisplay(raw)} · ${raw} (system account)`;
}
