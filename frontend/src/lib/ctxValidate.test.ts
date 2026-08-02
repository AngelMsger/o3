import { describe, it, expect } from 'vitest';
import { ctxErrors, errorCount, invalidLabel, showError, VALIDATORS } from './ctxValidate';
import type { CtxDraft } from './ctxValidate';

const draft = (over: Partial<CtxDraft> = {}): CtxDraft => ({
  name: 'prod',
  url: 'https://observe.example.internal',
  org: 'default',
  scheme: 'basic',
  username: 'ops@example.com',
  password: 'hunter2',
  token: '',
  hasSecret: false,
  ...over,
});

describe('field rules', () => {
  it('name rejects blanks and spaces', () => {
    expect(VALIDATORS.name('')).toMatch(/required/);
    expect(VALIDATORS.name('my prod')).toMatch(/dashes/);
    expect(VALIDATORS.name('my-prod')).toBe('');
  });

  it('url demands an http(s) scheme', () => {
    expect(VALIDATORS.url('')).toMatch(/required/);
    expect(VALIDATORS.url('observe.example.internal')).toMatch(/http:\/\//);
    expect(VALIDATORS.url('ftp://observe')).toMatch(/http:\/\//);
    expect(VALIDATORS.url('http://localhost:5080')).toBe('');
    expect(VALIDATORS.url('  https://o.example  ')).toBe('');
  });

  it('email must look like an address', () => {
    expect(VALIDATORS.username('ops')).toMatch(/valid email/);
    expect(VALIDATORS.username('ops@example')).toMatch(/valid email/);
    expect(VALIDATORS.username('ops@example.com')).toBe('');
  });

  it('token warns about the oo_ prefix', () => {
    expect(VALIDATORS.token('')).toMatch(/required/);
    expect(VALIDATORS.token('abcdef')).toMatch(/oo_sa_/);
    expect(VALIDATORS.token('oo_sa_123')).toBe('');
  });
});

describe('ctxErrors', () => {
  it('passes a complete basic-auth context', () => {
    expect(ctxErrors(draft())).toEqual({});
  });

  it('checks email and password only for basic auth', () => {
    expect(ctxErrors(draft({ username: '', password: '' }))).toEqual({
      username: expect.any(String),
      password: expect.any(String),
    });
    expect(ctxErrors(draft({ scheme: 'session', username: '', password: '' }))).toEqual({});
    expect(ctxErrors(draft({ scheme: 'sso', username: '', password: '' }))).toEqual({});
  });

  it('checks the token only for token auth', () => {
    expect(ctxErrors(draft({ scheme: 'token', token: '' })).token).toMatch(/required/);
    expect(ctxErrors(draft({ scheme: 'token', token: 'oo_sa_ok' }))).toEqual({});
  });

  // o3 never reads a stored credential back into the form, so a saved context
  // shows an empty password box. Requiring one would flag every working setup.
  it('does not demand a secret that is already in the keychain', () => {
    expect(ctxErrors(draft({ password: '', hasSecret: true }))).toEqual({});
    expect(ctxErrors(draft({ scheme: 'token', token: '', hasSecret: true }))).toEqual({});
  });

  it('still validates a token the user retyped over a stored one', () => {
    expect(ctxErrors(draft({ scheme: 'token', token: 'nope', hasSecret: true })).token).toMatch(/oo_sa_/);
  });

  it('always checks the endpoint fields', () => {
    const e = ctxErrors(draft({ scheme: 'session', name: '', url: 'nope', org: '' }));
    expect(Object.keys(e).sort()).toEqual(['name', 'org', 'url']);
  });

  it('tolerates a missing context', () => {
    expect(ctxErrors(null)).toEqual({});
    expect(errorCount(undefined)).toBe(0);
  });
});

describe('presentation', () => {
  it('pluralises the summary banner', () => {
    expect(invalidLabel(1)).toMatch(/^1 field needs/);
    expect(invalidLabel(3)).toMatch(/^3 fields need/);
  });

  it('hides an error until the field is blurred or a save is attempted', () => {
    const errs = ctxErrors(draft({ url: '' }));
    expect(showError(errs, {}, 'prod', 'url', false)).toBe(false);
    expect(showError(errs, { 'prod:url': true }, 'prod', 'url', false)).toBe(true);
    expect(showError(errs, {}, 'prod', 'url', true)).toBe(true);
  });

  it('scopes touch flags per context so switching rows starts clean', () => {
    const errs = ctxErrors(draft({ url: '' }));
    expect(showError(errs, { 'staging:url': true }, 'prod', 'url', false)).toBe(false);
  });

  it('shows nothing for a field that is valid', () => {
    expect(showError(ctxErrors(draft()), { 'prod:url': true }, 'prod', 'url', true)).toBe(false);
  });
});
