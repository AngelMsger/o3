import { describe, it, expect } from 'vitest';
import { preserveDrafts } from './contexts';

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
