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
