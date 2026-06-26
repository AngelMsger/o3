# o3 — OpenObserve Desktop · Query Workspace UX Redesign — Design Spec

Date: 2026-06-26
Status: Approved (brainstorming) — pending written-spec review
Scope: Rework the query workspace (tabs, SQL/Search buffers, stream selection, field
insertion, autocomplete) so the editor behaves coherently against live data.

## 1. Goal & non-goals

After the live-data + multi-context work, the query workspace has UX defects found in
live use: SQL and Search share one buffer (content is meaningless after switching);
selecting a stream does not update the SQL and steals editor focus; clicking a field
does nothing; the autocomplete popup shows static mock suggestions unrelated to the
current stream; tabs cannot be renamed; and the editor text is not synced back to the
active tab (switching tabs loses the query). This redesign makes the tab the single
source of truth for its editor, gives each mode its own buffer, syncs stream and query
bidirectionally, inserts fields at the caret, makes autocomplete context-aware, and adds
tab rename.

### Non-goals (deferred)
- Replacing the lightweight textarea-overlay editor with a heavyweight editor
  (Monaco/CodeMirror). Keep the existing overlay.
- Rewriting `FROM` in multi-`FROM` / subquery SQL. Handle the single/first `FROM`.
- Autocomplete in Search mode (Search is free text).
- Query-history persistence (the history dropdown stays UI-only).
- Search-mode field insertion semantics beyond inserting the raw field name.

## 2. Decisions (from brainstorming)

- **Independent buffers per mode, per tab** — each tab has its own `sql` and `search`
  text and remembers its `mode`.
- **Bidirectional stream <-> query sync** — picking a stream rewrites the `FROM`
  (SQL) / sets the target (Search); running follows the query's `FROM`.
- **Caret-aware field insertion** — clicking a field inserts at the editor caret and
  keeps focus.
- **Context-aware autocomplete, SQL mode only** — live stream fields + SQL
  keywords/functions; auto-opens while typing; keyboard-navigable.
- **Tab rename** — double-click to edit inline.

## 3. Per-tab workspace state model

`QueryTab` (in `frontend/src/types.ts`) changes from `{ id, name, q, stream }` to:
```ts
export interface QueryTab {
  id: string;
  name: string;
  mode: QueryMode;   // 'sql' | 'search'
  sql: string;       // SQL-mode buffer
  search: string;    // Search-mode buffer (free-text terms)
  stream: string;    // the tab's target stream
}
```
The tab is the single source of truth. In `App.tsx` the standalone `query`,
`queryMode`, and `stream` `useState`s are replaced by values derived from the active
tab plus write-through setters:
- `activeTabData = tabs.find(t => t.id === activeTab) ?? tabs[0]`
- `mode = activeTabData.mode`; `stream = activeTabData.stream`
- `editorText = mode === 'sql' ? activeTabData.sql : activeTabData.search`
- `setEditorText(text)` -> updates the active tab's active buffer
  (`mode === 'sql' ? sql : search`).
- `setMode(m)` -> updates `activeTabData.mode` (swaps the visible buffer; the other
  buffer is preserved).
- `setActiveStream(s)` -> updates `activeTabData.stream`.

Typing writes through `setEditorText` so the buffer is always in the tab (fixes the
tab-switch-loses-query bug). Switching tabs restores that tab's mode + buffers +
stream automatically (everything derives from `activeTabData`).

New/initial tabs: `{ id, name: 'untitled', mode: 'sql', sql: <seed or ''>, search: '',
stream }`. The startup/context-switch seed writes the seed SQL into the active tab's
`sql` buffer only when it is empty (unchanged behavior, now targeting the buffer).

## 4. Stream <-> query bidirectional sync

A pure helper `setFromStream(sql, stream)` (in `frontend/src/lib/format.ts`):
```ts
const FROM_RE = /\bfrom\s+"?([\w.-]+)"?/i;
export function setFromStream(sql: string, stream: string): string {
  if (!sql.trim()) return `SELECT *\nFROM "${stream}"\nORDER BY _timestamp DESC\nLIMIT 100`;
  if (FROM_RE.test(sql)) return sql.replace(FROM_RE, `FROM "${stream}"`);
  return sql; // no FROM in a non-empty buffer: leave text; caller still sets tab.stream
}
```
`onPickStream(name)`:
- `setActiveStream(name)`.
- if SQL mode: `setEditorText(setFromStream(activeTabData.sql, name))`.
- close the stream dropdown and **refocus the editor**.
- the `GetFields` effect (keyed on the active tab's stream) reloads that stream's fields.

After a Run, the effective stream is `fromStream(sql) || stream` (SQL) or `stream`
(Search), and the dropdown follows it (existing behavior). Pick and run are distinct
actions, so they do not fight.

## 5. Caret-aware field insertion + focus

`QueryEditor` accepts a `textareaRef` (a `React.RefObject<HTMLTextAreaElement>`) and
attaches it to its textarea, so `App` can read `selectionStart`/`selectionEnd` and set
focus + selection. `onInsertField(name)` in `App.tsx`:
```ts
const ta = textareaRef.current;
const pos = ta ? ta.selectionStart : editorText.length;
const end = ta ? ta.selectionEnd : editorText.length;
const next = editorText.slice(0, pos) + name + editorText.slice(end);
setEditorText(next);
// restore focus + caret after the inserted text on the next frame
requestAnimationFrame(() => {
  if (!ta) return;
  ta.focus();
  ta.selectionStart = ta.selectionEnd = pos + name.length;
});
```
Inserting a field never strands focus; picking a stream likewise refocuses the editor.
Field insertion writes into the active buffer (so it applies in SQL mode; in Search mode
it inserts the raw field token, which is acceptable).

## 6. Context-aware autocomplete (SQL mode only)

`computeSuggestions` (in `frontend/src/lib/format.ts`) takes the live fields as a
parameter instead of the mock `FIELDS`:
```ts
export function computeSuggestions(word: string, fields: Field[]): Suggestion[] {
  const w = word.toLowerCase();
  if (!w) return [];
  const out: Suggestion[] = [];
  KEYWORDS.forEach(k => { if (k.toLowerCase().startsWith(w)) out.push({ label: k, kind: 'keyword', tag: 'K', detail: 'keyword', color: '#ff7b9c' }); });
  FUNCS.forEach(f => { if (f[0].toLowerCase().startsWith(w)) out.push({ label: f[0], kind: 'function', tag: 'ƒ', detail: f[1], color: '#7dd3fc' }); });
  fields.forEach(f => { if (f.name.toLowerCase().startsWith(w)) out.push({ label: f.name, kind: 'field', tag: '·', detail: f.type, color: '#a3e08c' }); });
  return out.slice(0, 8);
}
```
`KEYWORDS`/`FUNCS` remain (SQL constants). `fields` is the live `liveFields` for the
active stream.

Current word: `wordBeforeCaret(text, caret)` returns the `[\w.]+` token ending at the
caret (`''` if none). Suggestions = `computeSuggestions(wordBeforeCaret(editorText,
caret), liveFields)`.

Trigger/visibility: the popup is open when `mode === 'sql'` AND the editor is focused AND
the current word is non-empty AND there is at least one suggestion. It closes on blur,
Esc, when the word becomes empty, or after accepting.

Keyboard (handled in `QueryEditor`'s textarea `onKeyDown` when the popup is open):
- ArrowDown / ArrowUp -> move the active selection (App holds `acActiveIndex`).
- Tab / Enter -> accept the active suggestion: replace the current word at the caret
  with the suggestion label, set the caret after it.
- Escape -> close the popup.
When the popup is closed these keys behave normally (Enter inserts a newline, Tab is the
existing behavior). `QueryEditor` receives `acOpen`, `acCount`, `acActiveIndex`, and
callbacks `onAcMove(delta)`, `onAcAccept()`, `onAcClose()`.

Accept replaces `wordBeforeCaret` (length `len`) with `label`:
```ts
const start = caret - currentWord.length;
const next = editorText.slice(0, start) + label + editorText.slice(caret);
setEditorText(next);
requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = start + label.length; });
```

## 7. Tab rename

`QueryTabs` gains `onRename(id, name)`. Double-click on a tab name enters an inline
editing state (local to `QueryTabs`): the name becomes a small text `<input>`
pre-filled with the current name. Enter or blur confirms (`onRename(id, trimmedValue)`
when non-empty; empty reverts to the previous name); Esc cancels. `App`'s `onRename`
updates that tab's `name`.

## 8. Components touched

- `types.ts` — `QueryTab` shape (mode/sql/search replace `q`).
- `App.tsx` — active-tab-derived state + write-through setters; `onPickStream` (FROM
  rewrite + refocus); `onInsertField` (caret insert); autocomplete state
  (`caret`, `acActiveIndex`, current word, suggestions, open logic, accept) ; `runQuery`
  reads the active buffer/mode/stream; tab handlers (new/seed write to buffers);
  `onRename`.
- `QueryEditor.tsx` — `textareaRef` prop; `onCaretChange` (selection -> App);
  autocomplete key handling via the `acOpen`/`acCount`/`acActiveIndex` props +
  `onAcMove`/`onAcAccept`/`onAcClose` callbacks.
- `FieldsPanel.tsx` — `onInsertField` wired (already a prop; App now implements it).
- `Autocomplete.tsx` — driven by live suggestions + `acActiveIndex`; hover/click
  unchanged.
- `QueryTabs.tsx` — inline rename.
- `lib/format.ts` — `computeSuggestions(word, fields)`; new `setFromStream(sql, stream)`
  and `wordBeforeCaret(text, caret)`.

## 9. Testing

- **Pure unit tests** (`frontend/src/lib/format.test.ts`, the existing Vitest suite):
  `setFromStream` (empty -> seed; existing FROM replaced; no-FROM non-empty left as-is;
  quoted/unquoted table), `wordBeforeCaret` (token at caret, none, mid-word),
  `computeSuggestions(word, fields)` (matches live fields + keywords + functions; empty
  word -> []; cap at 8).
- The editor interaction (caret insertion, autocomplete navigation, mode/buffer
  switching, tab rename, stream<->FROM sync) is build-gated (`wails build` -> TS
  compiles + bundle) and verified manually in the running app (consistent with the
  project's no-live-test-in-session rule).

## 10. Risks / notes

- The textarea-overlay editor has no rich caret API beyond `selectionStart/End`; the
  `requestAnimationFrame` focus/caret restore is the standard workaround and must run
  after React commits the new value.
- `setFromStream`'s regex rewrites the first `FROM` only; multi-`FROM`/subquery SQL is a
  documented non-goal.
- Autocomplete key handling must not swallow Enter/Tab when the popup is closed (guard on
  `acOpen`).
- Switching mode preserves both buffers; an empty Search buffer is expected on first
  switch (this is the fix for "Search inherits the SQL content").
