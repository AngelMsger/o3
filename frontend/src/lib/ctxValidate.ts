// Per-field validation for a connection context, shared by Settings and the
// Setup Wizard so the two surfaces cannot disagree about what "valid" means.
//
// Design (Observe.dc.html, VALIDATORS/ctxErrors): every field validates on blur
// and again on Test & Save — a red border plus an inline reason, a summary
// banner, and a Test button that reports "⚠ Check the fields" instead of firing
// a request that was never going to work.
//
// One deviation from the design mock, forced by how o3 actually stores secrets:
// the mock keeps passwords and tokens in component state, so it can demand them
// unconditionally. o3 deliberately never reads a credential back out of the
// keychain, so a *saved* context legitimately shows an empty password box.
// Requiring one there would flag every correctly-configured context, so the
// secret fields are only required when the keychain has nothing stored yet
// (`hasSecret === false`).

// CtxDraft is the subset of a context the validators look at. It is structural
// so both App's UICtx and the wizard's copy satisfy it without a shared import.
export interface CtxDraft {
  name: string;
  url: string;
  org: string;
  scheme: string;    // 'session' | 'basic' | 'token' | 'sso'
  username: string;  // email, for basic auth
  password: string;
  token: string;
  hasSecret: boolean;
}

// FieldKey enumerates the validated fields. 'username' is the email box; the
// design calls it `email`, o3 stores it as the auth username.
export type FieldKey = 'name' | 'url' | 'org' | 'username' | 'password' | 'token';

export const FIELD_KEYS: FieldKey[] = ['name', 'url', 'org', 'username', 'password', 'token'];

export type CtxErrors = Partial<Record<FieldKey, string>>;

// Individual rules, exported so a caller can validate one value in isolation
// (browser sign-in only cares about the URL).
export const VALIDATORS: Record<FieldKey, (v: string) => string> = {
  name: (v) => {
    const s = v.trim();
    if (!s) return 'Context name is required';
    if (/\s/.test(s)) return 'Use dashes instead of spaces';
    return '';
  },
  url: (v) => {
    const s = v.trim();
    if (!s) return 'Server URL is required';
    if (!/^https?:\/\/\S+$/i.test(s)) return 'Must start with http:// or https://';
    return '';
  },
  org: (v) => (v.trim() ? '' : 'Organization is required'),
  username: (v) => {
    const s = v.trim();
    if (!s) return 'Email is required for basic auth';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return 'Not a valid email address';
    return '';
  },
  password: (v) => (v ? '' : 'Password is required for basic auth'),
  token: (v) => {
    const s = v.trim();
    if (!s) return 'A service-account token is required';
    if (!/^oo_/.test(s)) return 'Tokens normally start with oo_sa_';
    return '';
  },
};

// ctxErrors returns every field that fails, keyed by field. Which credential
// fields apply depends on the auth scheme: browser sign-in and SSO carry no
// typed credential at all, so only the endpoint fields are checked.
export function ctxErrors(c: CtxDraft | null | undefined): CtxErrors {
  if (!c) return {};
  const e: CtxErrors = {};
  const put = (k: FieldKey, v: string) => {
    const m = VALIDATORS[k](v ?? '');
    if (m) e[k] = m;
  };
  put('name', c.name);
  put('url', c.url);
  put('org', c.org);
  if (c.scheme === 'basic') {
    put('username', c.username);
    // Empty is correct for a context whose password already lives in the
    // keychain — see the note at the top of this file.
    if (!c.hasSecret) put('password', c.password);
  } else if (c.scheme === 'token') {
    if (!c.hasSecret || c.token) put('token', c.token);
  }
  return e;
}

export function errorCount(c: CtxDraft | null | undefined): number {
  return Object.keys(ctxErrors(c)).length;
}

// invalidLabel is the summary banner's sentence, shown once Test & Save has been
// attempted with errors outstanding.
export function invalidLabel(n: number): string {
  return n === 1
    ? '1 field needs attention before this context can connect.'
    : `${n} fields need attention before this context can connect.`;
}

// errTitle is the tooltip on a context row's ⚠ marker.
export function errTitle(n: number): string {
  return n === 1 ? '1 field needs attention' : `${n} fields need attention`;
}

// touchKey namespaces the "user has left this field" flags per context, so
// picking another context to edit starts with a clean form rather than
// inheriting the previous one's red borders.
export function touchKey(ctxName: string, field: FieldKey): string {
  return `${ctxName}:${field}`;
}

// showError decides whether a field's error is visible yet: only after the user
// has blurred that field, or once a save/test has been attempted. Typing a URL
// must not paint it red before it can possibly be complete.
export function showError(
  errors: CtxErrors,
  touched: Record<string, boolean>,
  ctxName: string,
  field: FieldKey,
  saveTried: boolean,
): boolean {
  return !!errors[field] && (saveTried || !!touched[touchKey(ctxName, field)]);
}
