// Context-list helpers, kept pure so the draft-preservation rule is unit-tested.
//
// A newly-added context is a frontend-only "draft" until SaveContext persists it.
// Reloading the list from the backend (on switch/remove/save) must NOT discard an
// in-progress draft — that was the "the fresh new context disappears" bug.

// preserveDrafts merges a freshly-loaded backend list with any unsaved drafts from
// the previous state. Backend entries win; a draft is kept only while the backend
// has no context of the same name (once saved, the backend copy replaces it).
export function preserveDrafts<T extends { name: string; draft: boolean }>(backend: T[], prev: T[]): T[] {
  const names = new Set(backend.map((c) => c.name));
  return [...backend, ...prev.filter((c) => c.draft && !names.has(c.name))];
}

// draftName picks a free name for a new draft, deduping against the existing
// contexts so repeat "+ New context" clicks never collide.
export function draftName(existing: { name: string }[], base: string): string {
  let name = base;
  let seq = 2;
  while (existing.some((c) => c.name === name)) {
    name = `${base}-${seq}`;
    seq += 1;
  }
  return name;
}

// seedIfEmpty guarantees there is always at least one context to edit.
//
// A first launch has no config file, so the backend returns ZERO contexts. The
// Setup Wizard binds its fields to the SELECTED context and guards each onChange
// on it, so an empty list rendered a wizard whose inputs silently swallowed
// every keystroke and whose buttons were all disabled — the app was unusable on
// a fresh install. Seeding a draft restores an editable first-run form.
//
// Returns the input unchanged when it is non-empty, so calling it more than once
// (React may run an effect twice) cannot produce a second draft.
export function seedIfEmpty<T>(list: T[], makeDraft: (name: string) => T): T[] {
  return list.length > 0 ? list : [makeDraft('default')];
}
