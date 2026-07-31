import { describe, it, expect } from 'vitest';
import { draftName, preserveDrafts, seedIfEmpty } from './contexts';

type C = { name: string; draft: boolean };

describe('preserveDrafts', () => {
  it('keeps an unsaved draft across a backend reload (bug: draft vanished on switch)', () => {
    const backend: C[] = [{ name: 'prod', draft: false }];
    const prev: C[] = [{ name: 'prod', draft: false }, { name: 'new-context', draft: true }];
    expect(preserveDrafts(backend, prev)).toEqual([
      { name: 'prod', draft: false },
      { name: 'new-context', draft: true },
    ]);
  });

  it('drops a draft once the backend has it (after save — no duplicate)', () => {
    const backend: C[] = [{ name: 'prod', draft: false }, { name: 'staging', draft: false }];
    const prev: C[] = [{ name: 'staging', draft: true }]; // was a draft, now persisted
    expect(preserveDrafts(backend, prev)).toEqual([
      { name: 'prod', draft: false },
      { name: 'staging', draft: false },
    ]);
  });

  it('never resurrects a removed persisted context', () => {
    const backend: C[] = [{ name: 'prod', draft: false }];
    const prev: C[] = [{ name: 'prod', draft: false }, { name: 'gone', draft: false }];
    expect(preserveDrafts(backend, prev)).toEqual([{ name: 'prod', draft: false }]);
  });
});

describe('seedIfEmpty', () => {
  // On a first launch there is no config file, so the backend returns ZERO
  // contexts. The Setup Wizard edits the SELECTED context, so an empty list left
  // every field bound to `undefined` and its onChange guarded by it: the wizard
  // rendered, but typing into Context name / Server URL / Organization did
  // nothing at all, and every button was disabled. The list must never be empty.
  const make = (name: string): C => ({ name, draft: true });

  it('seeds one draft when the backend has no contexts (first launch)', () => {
    expect(seedIfEmpty([], make)).toEqual([{ name: 'default', draft: true }]);
  });

  it('leaves an existing list untouched', () => {
    const list: C[] = [{ name: 'prod', draft: false }];
    expect(seedIfEmpty(list, make)).toBe(list);
  });

  it('is idempotent, so a repeated call cannot produce two drafts', () => {
    const once = seedIfEmpty<C>([], make);
    expect(seedIfEmpty(once, make)).toBe(once);
  });
});

describe('draftName', () => {
  it('uses the base name when it is free', () => {
    expect(draftName([{ name: 'prod' }], 'new-context')).toBe('new-context');
  });

  it('dedupes against existing names so repeat clicks never collide', () => {
    const existing = [{ name: 'new-context' }, { name: 'new-context-2' }];
    expect(draftName(existing, 'new-context')).toBe('new-context-3');
  });
});
