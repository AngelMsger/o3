# Query Workspace UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the query workspace coherent: per-tab independent SQL/Search buffers, bidirectional stream<->query sync, caret-aware field insertion, context-aware autocomplete (live fields), and tab rename.

**Architecture:** The `QueryTab` becomes the single source of truth for its editor (its own `sql`/`search` buffers + `mode` + `stream`); App.tsx derives the editor state from the active tab and writes through to it. Pure helpers (`setFromStream`, `wordBeforeCaret`, `computeSuggestions(word, fields)`) move to `lib/format.ts` and are unit-tested; the editor/insertion/autocomplete/rename interactions are build-gated and manually verified.

**Tech Stack:** React 18 + TypeScript + Vite, Vitest (frontend unit tests), Wails v2.

## Global Constraints

- **The tab is the single source of truth.** The editor text is the active tab's active buffer; typing writes back to the tab. No standalone `query`/`queryMode`/`stream` state that can drift.
- **Independent buffers per mode, per tab** — switching mode swaps the visible buffer; the other buffer is preserved (an empty Search buffer on first switch is correct).
- **Bidirectional stream<->query** — picking a stream rewrites the SQL `FROM` (or sets the Search target) and refocuses the editor; running follows the query's `FROM`.
- **Caret-aware insertion** — field clicks and autocomplete accepts insert at `textarea.selectionStart` and restore focus + caret.
- **Autocomplete is SQL-mode only**, driven by live fields (`liveFields`) + `KEYWORDS` + `FUNCS`; auto-opens while typing a non-empty word; keyboard-navigable; never swallows Enter/Tab when closed.
- **Keep the textarea-overlay editor** (no Monaco/CodeMirror). `FROM` rewriting handles the single/first `FROM` only.
- GATE for UI tasks: clean `wails build` (TypeScript compiles + bundle). The live run is the user's manual step (no live-test-in-session). Pure helpers are Vitest-tested.
- NEVER run `go work sync`/`go mod tidy`; if `wails build` dirties `frontend/wailsjs/runtime/*` or `go.mod`/`go.sum`, do not stage them. After Go-touching commands verify the sibling repo `git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain` is empty.
- ASCII half-width punctuation in comments and commit messages.

---

## File Structure

- `frontend/src/types.ts` — `QueryTab` shape change (`mode`/`sql`/`search` replace `q`).
- `frontend/src/lib/format.ts` — new pure helpers `setFromStream`, `fromStream`, `wordBeforeCaret`; `computeSuggestions` gains a `fields` parameter.
- `frontend/src/lib/format.test.ts` — unit tests for the new/changed helpers.
- `frontend/src/App.tsx` — active-tab-derived state + write-through setters; `onPickStream`; `onInsertField`; autocomplete state; tab handlers; `onRename`; `runQuery` reads buffers.
- `frontend/src/components/QueryEditor.tsx` — `textareaRef`, `onCaretChange`, autocomplete key handling.
- `frontend/src/components/FieldsPanel.tsx` — no change to its interface; App now implements `onInsertField` (FieldsPanel already calls `onInsertField(f.name)`).
- `frontend/src/components/Autocomplete.tsx` — already prop-driven (`suggestions`/`activeIndex`/`onSelect`/`onHover`); App feeds it live data.
- `frontend/src/components/QueryTabs.tsx` — inline rename.

---

### Task 1: Pure helpers + `QueryTab` shape (TDD)

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/format.ts`
- Modify (tests): `frontend/src/lib/format.test.ts`

**Interfaces:**
- Consumes: `Field` (`{ name: string; type: string }`), `Suggestion`, `QueryMode` from `types.ts`; `KEYWORDS`, `FUNCS` from `data/mock.ts`.
- Produces:
  - `interface QueryTab { id: string; name: string; mode: QueryMode; sql: string; search: string; stream: string }`
  - `function fromStream(sql: string): string` — first `FROM` table name (`''` if none)
  - `function setFromStream(sql: string, stream: string): string`
  - `function wordBeforeCaret(text: string, caret: number): string`
  - `function computeSuggestions(word: string, fields: Field[]): Suggestion[]`

- [ ] **Step 1: Change the `QueryTab` type in `types.ts`**

Replace the existing `QueryTab` interface:
```ts
export interface QueryTab { id: string; name: string; q: string; stream: string; }
```
with:
```ts
export interface QueryTab {
  id: string;
  name: string;
  mode: QueryMode;   // active editor mode for this tab
  sql: string;       // SQL-mode buffer
  search: string;    // Search-mode buffer (free-text terms)
  stream: string;    // target stream
}
```
(`QueryMode` is already defined in `types.ts` as `'sql' | 'search'`.)

- [ ] **Step 2: Write failing tests in `frontend/src/lib/format.test.ts`**

Add these tests (keep the existing ones). Import the new helpers from `./format`:
```ts
import { describe, it, expect } from 'vitest';
import { setFromStream, fromStream, wordBeforeCaret, computeSuggestions } from './format';
import type { Field } from '../types';

describe('fromStream', () => {
  it('extracts an unquoted FROM table', () => {
    expect(fromStream('SELECT * FROM nginx_access WHERE a=1')).toBe('nginx_access');
  });
  it('extracts a quoted FROM table', () => {
    expect(fromStream('select * from "demo_logs" order by t')).toBe('demo_logs');
  });
  it('returns empty when no FROM', () => {
    expect(fromStream('SELECT 1')).toBe('');
  });
});

describe('setFromStream', () => {
  it('seeds a full query when the buffer is empty', () => {
    expect(setFromStream('   ', 'logs')).toBe('SELECT *\nFROM "logs"\nORDER BY _timestamp DESC\nLIMIT 100');
  });
  it('replaces an existing FROM table (quoting the new name)', () => {
    expect(setFromStream('SELECT * FROM old WHERE a=1', 'newone')).toBe('SELECT * FROM "newone" WHERE a=1');
  });
  it('replaces a quoted FROM table', () => {
    expect(setFromStream('SELECT * FROM "old" ORDER BY t', 'n2')).toBe('SELECT * FROM "n2" ORDER BY t');
  });
  it('leaves a non-empty buffer without FROM unchanged', () => {
    expect(setFromStream('SELECT 1', 'logs')).toBe('SELECT 1');
  });
});

describe('wordBeforeCaret', () => {
  it('returns the token ending at the caret', () => {
    expect(wordBeforeCaret('SELECT ser', 10)).toBe('ser');
  });
  it('includes dotted identifiers', () => {
    expect(wordBeforeCaret('WHERE k8s.name', 13)).toBe('k8s.na');
  });
  it('returns empty after a space', () => {
    expect(wordBeforeCaret('SELECT ', 7)).toBe('');
  });
});

describe('computeSuggestions', () => {
  const fields: Field[] = [{ name: 'service_name', type: 'string' }, { name: 'severity', type: 'string' }];
  it('matches live fields, keywords, and functions by prefix', () => {
    const out = computeSuggestions('se', fields);
    const labels = out.map(s => s.label);
    expect(labels).toContain('service_name');
    expect(labels).toContain('severity');
    expect(labels).toContain('SELECT'); // a KEYWORD starting with se (case-insensitive)
  });
  it('returns nothing for an empty word', () => {
    expect(computeSuggestions('', fields)).toEqual([]);
  });
  it('caps results at 8', () => {
    const many: Field[] = Array.from({ length: 20 }, (_, i) => ({ name: `sfield${i}`, type: 'string' }));
    expect(computeSuggestions('s', many).length).toBeLessThanOrEqual(8);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd /Users/angelmsger/Development/Workspaces/o3/frontend
npm test -- --run
```
Expected: FAIL — `setFromStream`, `fromStream`, `wordBeforeCaret` are not exported, and `computeSuggestions` does not accept a `fields` argument.

- [ ] **Step 4: Implement the helpers in `frontend/src/lib/format.ts`**

Add a `Field` import if not present (`import type { Field, Suggestion } from '../types';` — match the file's existing import style). Add:
```ts
const FROM_RE = /\bfrom\s+"?([\w.-]+)"?/i;

// fromStream returns the first FROM table name (unquoted), or '' when absent.
export function fromStream(sql: string): string {
  const m = sql.match(FROM_RE);
  return m ? m[1] : '';
}

// setFromStream points a query at a stream: it seeds a default query for an
// empty buffer, replaces an existing FROM table, or (for a non-empty buffer
// with no FROM) leaves the text unchanged.
export function setFromStream(sql: string, stream: string): string {
  if (!sql.trim()) {
    return `SELECT *\nFROM "${stream}"\nORDER BY _timestamp DESC\nLIMIT 100`;
  }
  if (FROM_RE.test(sql)) {
    return sql.replace(FROM_RE, `FROM "${stream}"`);
  }
  return sql;
}

// wordBeforeCaret returns the identifier token ending at the caret ('' if none).
export function wordBeforeCaret(text: string, caret: number): string {
  const left = text.slice(0, caret);
  const m = left.match(/[\w.]+$/);
  return m ? m[0] : '';
}
```
Then change `computeSuggestions` to take a `fields` parameter and drop the `FIELDS` mock dependency. Replace the existing function with:
```ts
export function computeSuggestions(word: string, fields: Field[]): Suggestion[] {
  const w = word.toLowerCase();
  if (!w) return [];
  const out: Suggestion[] = [];
  KEYWORDS.forEach((k) => {
    if (k.toLowerCase().startsWith(w)) out.push({ label: k, kind: 'keyword', tag: 'K', detail: 'keyword', color: '#ff7b9c' });
  });
  FUNCS.forEach((f) => {
    if (f[0].toLowerCase().startsWith(w)) out.push({ label: f[0], kind: 'function', tag: 'ƒ', detail: f[1], color: '#7dd3fc' });
  });
  fields.forEach((f) => {
    if (f.name.toLowerCase().startsWith(w)) out.push({ label: f.name, kind: 'field', tag: '·', detail: f.type, color: '#a3e08c' });
  });
  return out.slice(0, 8);
}
```
Remove the now-unused `FIELDS` import from `format.ts` if it imported it (keep `KEYWORDS`/`FUNCS`).

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd /Users/angelmsger/Development/Workspaces/o3/frontend
npm test -- --run
```
Expected: PASS (the new tests plus the existing `format.test.ts` tests). Output pristine.

Note: this step makes `App.tsx`/`QueryEditor.tsx` temporarily fail to typecheck (they still use `QueryTab.q` and the old `computeSuggestions` arity) — that is expected and fixed in Tasks 2-4. Do NOT run `wails build` here; the Vitest run above is the gate for this task.

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/types.ts frontend/src/lib/format.ts frontend/src/lib/format.test.ts
git commit -m "feat: per-tab QueryTab shape + pure query helpers (setFromStream, wordBeforeCaret, fields-aware suggestions)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Active-tab state model in `App.tsx`

This task makes the tab the single source of truth and wires bidirectional stream<->query sync. It restores compilation broken by Task 1's shape change. Gate: `wails build`.

**Files:**
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `QueryTab` (Task 1), `setFromStream`/`fromStream` (Task 1).
- Produces (used by Tasks 3-5): derived `activeTabData`, `mode`, `stream`, `editorText`; setters `setEditorText(text: string)`, `setMode(m: QueryMode)`, `setActiveStream(s: string)`; `onPickStream(name: string)`.

- [ ] **Step 1: Replace the tab/query/mode/stream state with active-tab derivation**

Read the current `App.tsx`. Replace the standalone `const [query, setQuery] = useState(...)`, `const [queryMode, setQueryMode] = useState<QueryMode>('sql')`, and `const [stream, setStream] = useState(...)` with derivation from the active tab. Initialize tabs with one untitled tab in the new shape:
```ts
const [tabs, setTabs] = useState<QueryTab[]>([
  { id: 't1', name: 'untitled', mode: 'sql', sql: '', search: '', stream: '' },
]);
const [activeTab, setActiveTab] = useState<string>('t1');
const activeTabData = tabs.find((t) => t.id === activeTab) ?? tabs[0];

const mode = activeTabData.mode;
const stream = activeTabData.stream;
const editorText = mode === 'sql' ? activeTabData.sql : activeTabData.search;

const patchActive = (patch: Partial<QueryTab>) =>
  setTabs((ts) => ts.map((t) => (t.id === activeTab ? { ...t, ...patch } : t)));
const setEditorText = (text: string) => patchActive(mode === 'sql' ? { sql: text } : { search: text });
const setMode = (m: QueryMode) => patchActive({ mode: m });
const setActiveStream = (s: string) => patchActive({ stream: s });
```
Update every reader of the old names: pass `query={editorText}`, `queryMode={mode}`, `onModeChange={setMode}`, `onQueryChange={setEditorText}` to `QueryEditor`; `stream={stream}` to `FieldsPanel`; the `GetFields` effect deps become `[stream, configured]` (now `stream` is `activeTabData.stream`); any `setStream(...)` becomes `setActiveStream(...)`; any `setQuery(...)` becomes `setEditorText(...)`.

- [ ] **Step 2: Rewrite `onPickStream` for bidirectional sync + refocus**

The `FieldsPanel` `onPickStream` handler (currently `(name) => { setStream(name); setStreamOpen(false); }`) becomes:
```ts
onPickStream={(name) => {
  setActiveStream(name);
  if (mode === 'sql') patchActive({ stream: name, sql: setFromStream(activeTabData.sql, name) });
  setStreamOpen(false);
  requestAnimationFrame(() => textareaRef.current?.focus());
}}
```
(`textareaRef` is introduced in Task 3; for THIS task, if `textareaRef` does not exist yet, omit the `requestAnimationFrame(...)` focus line and add it in Task 3. The state/sql changes above are this task's deliverable.)

Note: `setActiveStream(name)` then `patchActive({stream:name, sql:...})` — collapse into a single `patchActive` to avoid two state writes:
```ts
onPickStream={(name) => {
  patchActive(mode === 'sql'
    ? { stream: name, sql: setFromStream(activeTabData.sql, name) }
    : { stream: name });
  setStreamOpen(false);
}}
```

- [ ] **Step 3: Update the seed-on-stream-load and tab handlers for the new shape**

- The startup/context-switch seed (which set the tab's `q` and `query`) now writes the active tab's `sql` buffer only when empty:
```ts
// inside the ListStreams().then(...) after setActiveStream(mapped[0].name):
if (!activeTabData.sql.trim()) {
  patchActive({ stream: mapped[0].name, sql: setFromStream('', mapped[0].name) });
} else {
  patchActive({ stream: mapped[0].name });
}
```
(Adapt to the actual post-`ListStreams` code; the key change is writing `sql` not `q`, and only seeding when `sql` is empty. The context-switch path that reloads streams gets the same treatment.)
- `handleNewTab`: create the new shape, seeding `sql` from the current stream when known:
```ts
const handleNewTab = () => {
  tabSeq.current += 1;
  const id = `t-new-${tabSeq.current}`;
  const s = activeTabData.stream;
  setTabs((prev) => [...prev, { id, name: 'untitled', mode: 'sql', sql: s ? setFromStream('', s) : '', search: '', stream: s }]);
  setActiveTab(id);
};
```
- `handleCloseTab` is unchanged except it operates on the new shape (it already only uses `id`/`name`).

- [ ] **Step 4: Update `runQuery`/`buildRequest` to read the active buffer/mode/stream**

The existing `buildRequest`/`runQueryAt` (from the prior bug-fix) referenced `query`/`queryMode`/`stream`/`fromStream`. Point them at the active tab and the shared `fromStream` import:
```ts
import { setFromStream, fromStream } from './lib/format';
// remove the local fromStream defined inline in App.tsx (now imported)

const buildRequest = (): { sql: string; effStream: string } => {
  if (mode === 'search') {
    const eff = stream;
    const terms = activeTabData.search.trim();
    const where = terms ? ` WHERE match_all('${terms.replace(/'/g, "''")}')` : '';
    return { sql: `SELECT * FROM "${eff}"${where} ORDER BY _timestamp DESC`, effStream: eff };
  }
  const sql = activeTabData.sql;
  return { sql, effStream: fromStream(sql) || stream };
};
```
In `runQueryAt`, replace `if (effStream && effStream !== stream) setStream(effStream);` with `if (effStream && effStream !== stream) setActiveStream(effStream);`.

- [ ] **Step 5: Build**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: TypeScript compiles (no references to the removed `q`/`setQuery`/`setStream`/`queryMode` remain); bundle produced.

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/App.tsx
git commit -m "feat: tab-sourced editor state with independent SQL/Search buffers + stream<->FROM sync

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Caret tracking + field insertion

Gate: `wails build`.

**Files:**
- Modify: `frontend/src/components/QueryEditor.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `editorText`/`setEditorText` (Task 2).
- Produces: `textareaRef` (a `React.RefObject<HTMLTextAreaElement>` in App, passed to QueryEditor); `caret` state in App (number); `QueryEditor` props `textareaRef` and `onCaretChange(pos: number)`.

- [ ] **Step 1: Add `textareaRef` + `onCaretChange` to `QueryEditor`**

In `QueryEditor.tsx`, add to `QueryEditorProps`:
```ts
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  onCaretChange?: (pos: number) => void;
```
(Add `import type React from 'react'` or use the existing React types; the file already imports from 'react'.) Attach the ref and report caret on selection changes. Replace the `<textarea ... />` (lines 148-156) with:
```tsx
<textarea
  ref={textareaRef}
  className={styles.textarea}
  value={query}
  onChange={(e) => { onQueryChange(e.target.value); onCaretChange?.(e.target.selectionStart); }}
  onFocus={onEditorFocus}
  onBlur={onEditorBlur}
  onSelect={(e) => onCaretChange?.((e.target as HTMLTextAreaElement).selectionStart)}
  onKeyUp={(e) => onCaretChange?.((e.target as HTMLTextAreaElement).selectionStart)}
  onClick={(e) => onCaretChange?.((e.target as HTMLTextAreaElement).selectionStart)}
  spellCheck={false}
  wrap="soft"
/>
```

- [ ] **Step 2: Add the ref + caret state + `onInsertField` in `App.tsx`**

```ts
import { useRef } from 'react'; // if not already imported
const textareaRef = useRef<HTMLTextAreaElement>(null);
const [caret, setCaret] = useState<number>(0);
```
Pass `textareaRef={textareaRef}` and `onCaretChange={setCaret}` to `QueryEditor`. Implement `onInsertField`:
```ts
const handleInsertField = (name: string) => {
  const ta = textareaRef.current;
  const pos = ta ? ta.selectionStart : editorText.length;
  const end = ta ? ta.selectionEnd : editorText.length;
  const next = editorText.slice(0, pos) + name + editorText.slice(end);
  setEditorText(next);
  const newCaret = pos + name.length;
  setCaret(newCaret);
  requestAnimationFrame(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.focus();
    t.selectionStart = t.selectionEnd = newCaret;
  });
};
```
Change the `FieldsPanel` prop from `onInsertField={() => {}}` to `onInsertField={handleInsertField}`. (Also complete Task 2 Step 2's deferred `requestAnimationFrame(() => textareaRef.current?.focus())` in `onPickStream` now that `textareaRef` exists.)

- [ ] **Step 3: Build**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: TS compiles; bundle produced.

- [ ] **Step 4: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/components/QueryEditor.tsx frontend/src/App.tsx
git commit -m "feat: caret tracking + caret-aware field insertion

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Context-aware autocomplete (SQL mode)

Gate: `wails build`.

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/QueryEditor.tsx`

**Interfaces:**
- Consumes: `editorText`/`mode`/`caret`/`setEditorText`/`setCaret`/`textareaRef` (Tasks 2-3); `wordBeforeCaret`/`computeSuggestions` (Task 1); `liveFields` (existing App state).
- Produces: autocomplete state and the `acOpen`/`acCount`/`acActiveIndex` + `onAcMove`/`onAcAccept`/`onAcClose` contract on `QueryEditor`.

- [ ] **Step 1: Compute live suggestions in `App.tsx`**

Replace the hardcoded `const currentWord = 'co';` and `const suggestions = computeSuggestions(currentWord);` with caret-driven, mode-gated, live-field suggestions, and add a navigable active index:
```ts
const currentWord = mode === 'sql' ? wordBeforeCaret(editorText, caret) : '';
const suggestions = mode === 'sql' ? computeSuggestions(currentWord, liveFields) : [];
const [editorFocused, setEditorFocused] = useState<boolean>(false);
const [acActiveIndex, setAcActiveIndex] = useState<number>(0);
const acOpen = mode === 'sql' && editorFocused && currentWord.length > 0 && suggestions.length > 0;
```
Replace `onEditorFocus={() => setSuggestOpen(true)}` / `onEditorBlur={() => setSuggestOpen(false)}` with `onEditorFocus={() => setEditorFocused(true)}` / `onEditorBlur={() => setEditorFocused(false)}` (remove the now-unused `suggestOpen` state). Keep `acActiveIndex` in range: when `suggestions` shrink, clamp on render via `Math.min(acActiveIndex, Math.max(0, suggestions.length - 1))` where you pass it down.

Add the accept handler (replace the current word at the caret with the chosen label):
```ts
const acceptSuggestion = (label: string) => {
  const start = caret - currentWord.length;
  const next = editorText.slice(0, start) + label + editorText.slice(caret);
  setEditorText(next);
  const newCaret = start + label.length;
  setCaret(newCaret);
  setAcActiveIndex(0);
  requestAnimationFrame(() => {
    const t = textareaRef.current;
    if (!t) return;
    t.focus();
    t.selectionStart = t.selectionEnd = newCaret;
  });
};
```

- [ ] **Step 2: Feed the `Autocomplete` popup with live data**

Update the `autocomplete={<Autocomplete .../>}` JSX:
```tsx
autocomplete={
  <Autocomplete
    open={acOpen}
    currentWord={currentWord}
    suggestions={suggestions}
    activeIndex={Math.min(acActiveIndex, Math.max(0, suggestions.length - 1))}
    onSelect={(s) => acceptSuggestion(s.label)}
    onHover={(i) => setAcActiveIndex(i)}
  />
}
```
(`Autocomplete`'s props are already `open`/`currentWord`/`suggestions`/`activeIndex`/`onSelect`/`onHover`; `onSelect` receives the `Suggestion`. No change to `Autocomplete.tsx` is required.)

- [ ] **Step 3: Add keyboard handling to `QueryEditor`**

Add to `QueryEditorProps`:
```ts
  acOpen?: boolean;
  acCount?: number;
  acActiveIndex?: number;
  onAcMove?: (delta: number) => void;
  onAcAccept?: () => void;
  onAcClose?: () => void;
```
Add an `onKeyDown` to the textarea that intercepts navigation only when the popup is open:
```tsx
onKeyDown={(e) => {
  if (!acOpen) return;
  if (e.key === 'ArrowDown') { e.preventDefault(); onAcMove?.(1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); onAcMove?.(-1); }
  else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); onAcAccept?.(); }
  else if (e.key === 'Escape') { e.preventDefault(); onAcClose?.(); }
}}
```
Add this `onKeyDown` to the `<textarea>` element from Task 3 (alongside the existing handlers).

- [ ] **Step 4: Wire the keyboard contract in `App.tsx`**

Pass to `QueryEditor`:
```tsx
acOpen={acOpen}
acCount={suggestions.length}
acActiveIndex={Math.min(acActiveIndex, Math.max(0, suggestions.length - 1))}
onAcMove={(delta) => setAcActiveIndex((i) => {
  const n = suggestions.length;
  if (n === 0) return 0;
  return (Math.min(i, n - 1) + delta + n) % n;
})}
onAcAccept={() => { const s = suggestions[Math.min(acActiveIndex, suggestions.length - 1)]; if (s) acceptSuggestion(s.label); }}
onAcClose={() => setEditorFocused(false)}
```
(`onAcClose` blurring-the-popup via `setEditorFocused(false)` closes it without losing the textarea content; the textarea keeps focus, and the next keystroke reopens it if a word is present. Alternatively keep a dedicated `acDismissed` flag — but the simpler `editorFocused` gate is sufficient for this slice.)

Note: because the autocomplete `onKeyDown` intercepts `Enter`/`Tab` ONLY when `acOpen` is true, a closed popup leaves Enter (newline) and Tab behaving normally — satisfying the "never swallow Enter/Tab when closed" constraint.

- [ ] **Step 5: Build**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: TS compiles; bundle produced.

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/App.tsx frontend/src/components/QueryEditor.tsx
git commit -m "feat: context-aware autocomplete from live fields (SQL mode, keyboard-navigable)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Tab rename

Gate: `wails build`.

**Files:**
- Modify: `frontend/src/components/QueryTabs.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `tabs`/`setTabs` (App).
- Produces: `QueryTabs` prop `onRename(id: string, name: string)`.

- [ ] **Step 1: Inline rename in `QueryTabs.tsx`**

Add `onRename` to the component props and an internal editing state. Replace the component signature and the tab-name rendering:
```tsx
import { useState } from 'react';
// ...
export function QueryTabs({ tabs, activeId, onPick, onNew, onClose, onRename }: {
  tabs: QueryTab[];
  activeId: string;
  onPick: (id: string) => void;
  onNew: () => void;
  onClose: (id: string) => void;
  onRename: (id: string, name: string) => void;
}): ReactElement {
  const closable = tabs.length > 1;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>('');

  const commit = (id: string, fallback: string) => {
    const name = draft.trim() || fallback;
    onRename(id, name);
    setEditingId(null);
  };
```
In the tab's JSX, change `onDoubleClick` and the name span:
```tsx
onDoubleClick={() => { setEditingId(t.id); setDraft(t.name); }}
```
```tsx
{editingId === t.id ? (
  <input
    className={styles.nameEdit}
    value={draft}
    autoFocus
    onChange={(e) => setDraft(e.target.value)}
    onClick={(e) => e.stopPropagation()}
    onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(t.id, t.name); }
      else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
    }}
    onBlur={() => commit(t.id, t.name)}
  />
) : (
  <span className={styles.name}>{t.name}</span>
)}
```
Add a `.nameEdit` style to `QueryTabs.module.css` that visually matches `.name` (inherit font/size/color, transparent background, no border, a subtle focus outline). Read the existing `.name` rule and mirror it.

- [ ] **Step 2: Implement `onRename` + pass it in `App.tsx`**

```ts
const handleRenameTab = (id: string, name: string) =>
  setTabs((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)));
```
Pass `onRename={handleRenameTab}` to `<QueryTabs ... />`.

- [ ] **Step 3: Build**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: TS compiles; bundle produced.

- [ ] **Step 4: Manual live verification (developer-run)**

Run `wails dev`:
- Switching between SQL and Search keeps each buffer independent (Search no longer shows your SQL).
- Switching tabs restores that tab's text/mode/stream.
- Picking a stream rewrites the `FROM` and keeps the editor focused; clicking a field inserts it at the caret.
- Typing in SQL mode shows relevant suggestions (live stream fields + keywords); arrows/Tab/Enter/Esc work; no popup in Search mode.
- Double-click a tab name renames it.

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/components/QueryTabs.tsx frontend/src/components/QueryTabs.module.css frontend/src/App.tsx
git commit -m "feat: rename query tabs inline (double-click)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-26-query-workspace-ux-design.md`):
- §3 per-tab state model (mode/sql/search; tab as source of truth; write-through) → Task 1 (shape) + Task 2 (derivation/setters). ✓
- §4 stream<->query sync (`setFromStream`, `onPickStream`, run follows FROM) → Task 1 (`setFromStream`/`fromStream`) + Task 2 (`onPickStream`, `buildRequest`). ✓
- §5 caret-aware insertion + focus → Task 3. ✓
- §6 context-aware autocomplete (computeSuggestions(word,fields), trigger, keyboard nav) → Task 1 (helper) + Task 4. ✓
- §7 tab rename → Task 5. ✓
- §8 components touched → covered across Tasks 1-5. ✓
- §9 testing (pure Vitest for setFromStream/wordBeforeCaret/computeSuggestions; UI build-gated + manual) → Task 1 Step 2 + Tasks 2-5 build gates + Task 5 Step 4 manual. ✓
- §10 risks (rAF focus restore, single-FROM, no-swallow Enter/Tab when closed, empty Search buffer expected) → Task 3/4 (rAF), Task 1 (single FROM), Task 4 Step 4 note, Task 2 (buffers). ✓
- Non-goals (no heavy editor, no multi-FROM, no Search autocomplete, no history persistence) → none implemented. ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Tasks 2-5 are read-then-edit against `App.tsx`/`QueryEditor.tsx`/`QueryTabs.tsx` with the concrete handler/JSX code given and the exact current lines referenced (QueryEditor textarea at 148-156; QueryTabs name at 41 / onDoubleClick at 32) — bounded, not blank.

**3. Type consistency:** `QueryTab{id,name,mode,sql,search,stream}` (Task 1) is consumed by Task 2's derivation, Task 3/4 (read `editorText` = active buffer), and Task 5 (`name`). `setFromStream(sql,stream)`/`fromStream(sql)`/`wordBeforeCaret(text,caret)`/`computeSuggestions(word,fields)` (Task 1) match their uses in Tasks 2 (`onPickStream`/`buildRequest`) and 4 (`currentWord`/`suggestions`). The App setters `setEditorText`/`setMode`/`setActiveStream`/`patchActive` (Task 2) are used consistently in Tasks 3-5. `QueryEditor` props added in Task 3 (`textareaRef`,`onCaretChange`) and Task 4 (`acOpen`,`acCount`,`acActiveIndex`,`onAcMove`,`onAcAccept`,`onAcClose`) are passed from App in the same tasks. `QueryTabs` `onRename(id,name)` (Task 5) matches `handleRenameTab`. Consistent. ✓
