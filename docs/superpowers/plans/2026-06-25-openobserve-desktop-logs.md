# o3 OpenObserve Desktop — Logs Explorer (M1 Static Layout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a faithful, static React + Wails implementation of the OpenObserve "Logs" explorer screen (plus its Settings modal, setup wizard, value-action menu, and syntax-guide overlay) from the committed design `design/Observe.dc.html`.

**Architecture:** A Wails v2 desktop app (frameless window, macOS hidden titlebar) wrapping a Vite + React + TypeScript frontend. State lives in `App.tsx` via `useState` and flows down as props; no router, no data layer. UI runs entirely on mock data. The Go side is a default Wails scaffold with bound-method stubs (no I/O in M1). Styling = a global `tokens.css` + one CSS Module per component, reproducing the design's exact pixel/hex values.

**Tech Stack:** Wails v2, Go 1.26, React 18, TypeScript, Vite, CSS Modules, Vitest (for pure helpers only).

**Authoritative design source:** `design/Observe.dc.html` (1283 lines, committed). The plan references it by line range. Markup is NOT re-pasted into tasks — porting it verbatim from the committed file is the task. This is intentional sourcing, not a placeholder.

## Global Constraints

- Module path: `github.com/angelmsger/openobserve-desktop` (directory stays `o3`).
- Go floor: 1.24 (local is 1.26.4). Node: 20+ (local 24.14). Package manager: **npm** (no pnpm).
- Wails v2 (stable), not v3. Install CLI: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`.
- M1 is **static only**: no OpenObserve API calls, no auth, no Go client wiring, no router. Bound Go methods are no-op stubs.
- Fonts: `IBM Plex Sans` (UI), `JetBrains Mono` (code/data) via Google Fonts `<link>` (already in design `<helmet>`).
- Accent is a CSS var `--accent`, default `#2dd4bf`. Swatches: `#2dd4bf #7c83ff #f5a86a #5b9dff`.
- Inspector: single **right-side drawer** (`drawerOpen = !!selectedRow`). No inline/split inspector, no layout switcher (removed from design).
- Row density: `ultra` | `comfortable` (kept), set in Appearance, drives row padding via a `dense` flag.
- Copy rule (user global): ASCII half-width punctuation in any Chinese prose; not relevant to ported English UI strings — keep UI copy verbatim from the design.
- About panel: relabel "Tauri 2.0" → "Wails v2".
- Every component owns its markup + `*.module.css` and communicates via typed props (see `frontend/src/types.ts`, Task 2).

## Conversion Guide (read once, applies to every component task)

The design uses the `x-dc` template framework. Convert to React as follows:

| `x-dc` construct | React/TSX equivalent |
|---|---|
| `style="color:#fff; ..."` (static) | move to `*.module.css` class; reference `styles.foo` |
| `style="{{ x.style }}"` (computed string) | compute in TS or, preferred, express as CSS Module class + props/variants |
| `style-hover="background:#161b22;"` | `.foo:hover { background:#161b22; }` in the module |
| `style-focus="border-color:var(--accent);"` | `.foo:focus { border-color: var(--accent); }` |
| `<sc-for list="{{ items }}" as="it">…</sc-for>` | `{items.map((it) => (<…/>))}` with `key` |
| `<sc-if value="{{ flag }}">…</sc-if>` | `{flag && (<…/>)}` |
| `onClick="{{ handler }}"` | `onClick={props.handler}` |
| `{{ value }}` text interpolation | `{value}` JSX expression |
| `ref="{{ taRef }}"` | `ref={taRef}` (`useRef`) |
| `var(--accent,#2dd4bf)` | keep verbatim in CSS (the var lives in `tokens.css`) |

Rules:
- Preserve every numeric value, hex, spacing, and SVG path **exactly** as in the design.
- SVG icons: copy the `<svg>…</svg>` verbatim into the TSX (convert HTML attrs to JSX: `stroke-width` → `strokeWidth`, `stroke-linecap` → `strokeLinecap`, `viewBox` stays, `class` → `className`).
- Where the design computes a style string from state (e.g. active tab), reproduce the *visual outcome* with a CSS Module class toggled by a prop, not by building style strings.
- Mock data and helper logic come from the design `<script>` block (lines 690–1283); port the pieces each task names.

## Per-task verification (static UI)

Per the spec, M1 has **no automated DOM tests** — presentational tasks are gated by typecheck + build + visual check. Only `lib/format.ts` (pure helpers) gets Vitest unit tests (Task 2). Standard gate referenced below as **GATE**:

```
cd frontend && npm run typecheck && npm run build
```
Expected: `tsc --noEmit` exits 0, `vite build` succeeds. Then visual check via `wails dev` (from repo root) — confirm the new component renders matching the design, then commit.

---

## File Structure

```
o3/
├─ go.mod                         module github.com/angelmsger/openobserve-desktop
├─ go.work                        ./  +  ../oa-cli/src/openobserve-cli  (M2; present, unused in M1)
├─ main.go                        Wails bootstrap: frameless, hidden titlebar, embed frontend
├─ app.go                         App struct + stub bound methods
├─ wails.json                     Wails project config
├─ frontend/
│  ├─ package.json, vite.config.ts, tsconfig.json, index.html
│  ├─ src/
│  │  ├─ main.tsx                 React root
│  │  ├─ App.tsx                  owns all UI state; composes screen + overlays
│  │  ├─ types.ts                 shared TS types
│  │  ├─ data/mock.ts            FIELDS, STREAMS, LOGS, HISTORY, GUIDE, NAV, TIMES, etc.
│  │  ├─ lib/format.ts           pure helpers: hexA, histogramBars, highlight, makeRows, fmt
│  │  ├─ lib/format.test.ts      Vitest unit tests (the only tests in M1)
│  │  ├─ styles/tokens.css       vars, --accent, keyframes, .oo-scroll, base reset
│  │  └─ components/
│  │     ├─ TitleBar.{tsx,module.css}
│  │     ├─ NavRail.{tsx,module.css}
│  │     ├─ QueryTabs.{tsx,module.css}
│  │     ├─ QueryEditor.{tsx,module.css}
│  │     ├─ TimeRangePicker.{tsx,module.css}
│  │     ├─ HistoryDropdown.{tsx,module.css}
│  │     ├─ Autocomplete.{tsx,module.css}
│  │     ├─ FieldsPanel.{tsx,module.css}
│  │     ├─ Histogram.{tsx,module.css}
│  │     ├─ ResultsHeader.{tsx,module.css}
│  │     ├─ ResultsTable.{tsx,module.css}
│  │     ├─ DrawerInspector.{tsx,module.css}
│  │     ├─ SettingsModal.{tsx,module.css}
│  │     ├─ SetupWizard.{tsx,module.css}
│  │     ├─ ValueActionMenu.{tsx,module.css}
│  │     └─ SyntaxGuide.{tsx,module.css}
└─ design/Observe.dc.html         authoritative design (committed)
```

---

## Task 1: Scaffold Wails + React/TS project

**Files:**
- Create: `go.mod`, `go.work`, `main.go`, `app.go`, `wails.json`
- Create: `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/styles/tokens.css`

**Interfaces:**
- Produces: a buildable Wails app; `App.tsx` renders an empty rounded app frame (outer shell only).

- [ ] **Step 1: Install the Wails CLI**

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
wails version   # expect a v2.x version
wails doctor    # expect "SUCCESS" / no blocking issues on darwin
```

- [ ] **Step 2: Scaffold into the existing repo via a temp dir, then move**

`wails init` refuses a non-empty dir, so scaffold elsewhere and copy the generated files in (preserves our `docs/`, `design/`, `.git`).

```bash
TMP=$(mktemp -d)
wails init -n openobserve-desktop -t react-ts -d "$TMP/app"
# Copy scaffold (Go side, wails.json, frontend) into the repo, without clobbering docs/design/.git
rsync -a --exclude='.git' "$TMP/app/" /Users/angelmsger/Development/Workspaces/o3/
rm -rf "$TMP"
```

- [ ] **Step 3: Set the module path**

Edit `go.mod` line 1 to:
```
module github.com/angelmsger/openobserve-desktop
```
Run `go mod tidy`.

- [ ] **Step 4: Create `go.work` for M2 (present but unused now)**

Create `go.work`:
```
go 1.24

use (
	.
	../oa-cli/src/openobserve-cli
)
```
Run `go work sync`. (If it errors because the sibling path differs on another machine, that's an M2 concern; it must not break `wails build` in M1 because nothing imports the client yet.)

- [ ] **Step 5: Configure frameless window + hidden macOS titlebar**

In `main.go`, set the `options.App` fields:
```go
err := wails.Run(&options.App{
	Title:     "o3",
	Width:     1280,
	Height:    832,
	Frameless: true,
	Mac: &mac.Options{
		TitleBar:             mac.TitleBarHiddenInset(),
		WebviewIsTransparent: false,
		WindowIsTranslucent:  false,
	},
	BackgroundColour: &options.RGBA{R: 5, G: 6, B: 8, A: 1}, // #050608
	AssetServer:      &assetserver.Options{Assets: assets},
	OnStartup:        app.startup,
	Bind:             []interface{}{app},
})
```
Add the import `"github.com/wailsapp/wails/v2/pkg/options/mac"`. Keep the generated `embed` of `frontend/dist` as `assets`.

- [ ] **Step 6: Make the title bar draggable**

In `frontend/src/styles/tokens.css`, add the design's base styles (copy `:root`/reset/keyframes/scrollbar from `design/Observe.dc.html` lines 14–30) and a draggable region helper:
```css
.oo-drag { --wails-draggable: drag; }
.oo-no-drag { --wails-draggable: no-drag; }
```
Define `:root { --accent: #2dd4bf; }` and set `body { background: ... }` from design line 17.

- [ ] **Step 7: Replace `App.tsx` with the empty outer shell**

Port only the two outer wrappers from `design/Observe.dc.html` lines 32–38 (the `height:100vh` padded flex container + the `#0a0c11` rounded card with shadow). Move their inline styles into `App.module.css`. Body of the card empty for now.

- [ ] **Step 8: GATE + run**

```bash
cd frontend && npm install && npm run build
cd .. && wails build    # expect a successful macOS build
wails dev               # expect a frameless rounded dark window
```
Expected: window shows the empty rounded `#0a0c11` card on the `#050608` background, no native title bar.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: scaffold Wails v2 + React/TS app shell (frameless window)"
```

---

## Task 2: Shared types, mock data, and pure helpers (with tests)

**Files:**
- Create: `frontend/src/types.ts`, `frontend/src/data/mock.ts`, `frontend/src/lib/format.ts`, `frontend/src/lib/format.test.ts`
- Modify: `frontend/package.json` (add vitest), `frontend/vite.config.ts` (test config)

**Interfaces:**
- Produces (types.ts):
```ts
export type Density = 'ultra' | 'comfortable';
export type SettingsTab = 'connection' | 'appearance' | 'agent' | 'about';
export type TimeTab = 'relative' | 'absolute';
export type QueryMode = 'sql' | 'search';

export interface Field { name: string; type: string; }            // 'string' | 'int' | 'datetime'
export interface StreamInfo { name: string; size: string; color: string; }
export interface LogRow {
  id: string; time: string; level: string;       // INFO|WARN|ERROR|DEBUG
  service: string; body: string; ltype: string; trace: string;
  json: { k: string; v: string; kind: 'str' | 'num' }[];
}
export interface HistoryItem { q: string; preview: string; stream: string; meta: string; ago: string; }
export interface Suggestion { label: string; kind: 'keyword'|'function'|'field'; tag: string; detail: string; color: string; }
export interface QueryTab { id: string; name: string; q: string; stream: string; }
export interface GuideSection { title: string; items: { code: string; note: string }[]; }
export interface NavItem { name: string; icon: 'logs'|'metrics'|'traces'|'streams'|'dash'|'alerts'; soon: boolean; }
export interface HistoBar { h: number; }   // normalized 0..1 height
```
- Produces (format.ts):
```ts
export function hexA(hex: string, a: number): string;      // '#2dd4bf',0.16 -> 'rgba(45,212,191,0.16)'
export function histogramBars(): HistoBar[];               // 66 deterministic bars (design lines 901–918)
export function highlight(sql: string): { txt: string; color: string }[];  // tokenizer (design 879–899)
export function fmtAbs(s: string): string;                 // (s||'').slice(5,16)  (design ~line 998 fmt)
```
- Produces (mock.ts): `FIELDS: Field[]`, `STREAMS: StreamInfo[]`, `LOGS: LogRow[]`, `HISTORY: HistoryItem[]`, `GUIDE: GuideSection[]`, `NAV: NavItem[]`, `TIMES: string[]`, `KEYWORDS: string[]`, `FUNCS: [string,string][]`, `QUICK_RANGES: [string,number,string][]`, `TABS: QueryTab[]`.

- [ ] **Step 1: Add Vitest**

```bash
cd frontend && npm install -D vitest
```
Add to `package.json` scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.

- [ ] **Step 2: Write `types.ts`** exactly as in the Interfaces block above.

- [ ] **Step 3: Write failing tests** in `frontend/src/lib/format.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hexA, histogramBars, highlight } from './format';

describe('hexA', () => {
  it('converts hex + alpha to rgba', () => {
    expect(hexA('#2dd4bf', 0.16)).toBe('rgba(45,212,191,0.16)');
  });
});

describe('histogramBars', () => {
  it('is deterministic and returns 66 normalized bars', () => {
    const a = histogramBars(), b = histogramBars();
    expect(a).toHaveLength(66);
    expect(a).toEqual(b);
    expect(Math.max(...a.map(x => x.h))).toBeLessThanOrEqual(1);
    expect(Math.min(...a.map(x => x.h))).toBeGreaterThan(0);
  });
});

describe('highlight', () => {
  it('colors SQL keywords distinctly from identifiers', () => {
    const parts = highlight('SELECT body FROM demo_logs');
    const kw = parts.find(p => p.txt === 'SELECT');
    const id = parts.find(p => p.txt === 'demo_logs');
    expect(kw).toBeDefined();
    expect(id).toBeDefined();
    expect(kw!.color).not.toBe(id!.color);
  });
});
```

- [ ] **Step 4: Run tests, verify they fail**

```bash
npm test
```
Expected: FAIL — `format.ts` has no exports yet.

- [ ] **Step 5: Implement `format.ts`** by porting from the design `<script>`:
- `hexA`: design lines 827–833.
- `histogramBars`: design lines 901–918 — port the seeding loop (`for i<66: 0.35 + 0.45*abs(sin(i*1.3)+cos(i*0.7))/2 + (i%11===0?0.4:0) + (i%7===0?0.15:0)`), then normalize by max. Return `{h}` per bar.
- `highlight`: design lines 879–899 — the regex tokenizer; map keyword/function/number/string/default to the colors used there (str `#a3e08c` per line 916 context; keep the exact colors from the design).
- `fmtAbs`: the `fmt` slice helper near design line 998.

- [ ] **Step 6: Run tests, verify pass**

```bash
npm test
```
Expected: PASS (3 tests).

- [ ] **Step 7: Write `mock.ts`** by copying the data arrays verbatim from the design `<script>`:
- `FIELDS` ← lines 701–706 (as `{name,type}`).
- `STREAMS` ← line 707 + colors from `STREAM_COLORS` line 708 (as `{name,size,color}`).
- `KEYWORDS` ← line 694; `FUNCS` ← lines 695–699; `TIMES` ← line 709.
- `NAV` ← lines 710–719 (map to `{name,icon,soon}`; pick `icon` keys from the SVGs in nav rail lines 64–72).
- `TABS` ← lines 720–724 (the saved-query tabs).
- `LOGS` ← derive from `LOGSRC` (lines 726–763) using the `makeRows` transform (lines 816–826): compute `time`, `trace`, and the `json` kv list. Since M1 is static, precompute a fixed array (no `Date.now()`); use the design's base timestamp `2026-06-25T13:58:00.530+08:00`.
- `HISTORY` ← lines ~790–800; `GUIDE` ← `guideSections` (search the script for `guideSections`); `QUICK_RANGES` ← `QUICK` near line 1117.

- [ ] **Step 8: GATE** (typecheck + build), then **commit**

```bash
npm run typecheck && npm run build
git add -A && git commit -m "feat: shared types, mock data, and tested pure helpers"
```

---

## Task 3: App shell — TitleBar + NavRail + layout frame (WORKED EXAMPLE)

This task is the canonical conversion example; later tasks follow the same pattern.

**Files:**
- Create: `frontend/src/components/TitleBar.tsx` + `.module.css`, `frontend/src/components/NavRail.tsx` + `.module.css`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.module.css`

**Interfaces:**
- Consumes: `NAV` from mock.ts; `NavItem` from types.ts.
- Produces:
  - `<TitleBar />` — no props (static brand + avatar). Root element has `className="oo-drag"`; buttons/avatar `oo-no-drag`.
  - `<NavRail activeNav, onPick, onOpenSettings />` where `onPick: (name: string) => void`, `onOpenSettings: () => void`, `activeNav: string`.

- [ ] **Step 1: Port `TitleBar`** from `design/Observe.dc.html` lines 41–58.

`TitleBar.tsx`:
```tsx
import styles from './TitleBar.module.css';
export function TitleBar() {
  return (
    <div className={`${styles.bar} oo-drag`}>
      <div className={styles.lights}>
        <span className={styles.red} /><span className={styles.yellow} /><span className={styles.green} />
      </div>
      <div className={styles.brand}>
        <span className={styles.logo}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#06181a" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h4l3 8 4-16 3 8h6"/></svg>
        </span>
        <span className={styles.name}>o3</span>
        <span className={styles.crumb}>/ Logs</span>
      </div>
      <div style={{ flex: 1 }} />
      <div className={styles.avatar}>JD</div>
    </div>
  );
}
```
`TitleBar.module.css` — translate every inline style from lines 41–58 into classes (`.bar` = line 41's `height:42px;...`; `.lights span` colors `#ff5f57/#febc2e/#28c840`; `.logo` = line 47 with `box-shadow`; `.name`, `.crumb`, `.avatar` from their spans). Keep `var(--accent,#2dd4bf)` verbatim where used.

- [ ] **Step 2: Port `NavRail`** from lines 63–72 (rail + buttons) and the settings gear (lines below the `sc-for`, the gear `<button>` with the cog SVG).

```tsx
import styles from './NavRail.module.css';
import { NAV } from '../data/mock';
import type { NavItem } from '../types';

const ICONS: Record<NavItem['icon'], JSX.Element> = {
  // copy each nav SVG from design lines 64–72, one per icon key
  logs: (<svg /* … */ />),
  // metrics, traces, streams, dash, alerts …
};

export function NavRail({ activeNav, onPick, onOpenSettings }: {
  activeNav: string; onPick: (name: string) => void; onOpenSettings: () => void;
}) {
  return (
    <div className={styles.rail}>
      {NAV.map((n) => (
        <button key={n.name} title={n.name}
          className={`${styles.btn} ${activeNav === n.name ? styles.active : ''} ${n.soon ? styles.soon : ''}`}
          onClick={() => !n.soon && onPick(n.name)}>
          {ICONS[n.icon]}
          {n.soon && <span className={styles.dot} />}
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <button className={styles.gear} title="Settings" onClick={onOpenSettings}>
        {/* cog SVG verbatim from design */}
      </button>
    </div>
  );
}
```
`NavRail.module.css`: `.rail` from line 63; `.btn` base (36×36, radius 9); `.active { background: rgba(45,212,191,.14); color: var(--accent); }` (matches design's computed active style, line 1068); `.btn:hover`, `.soon` (muted, no pointer), `.dot`, `.gear` + `.gear:hover`.

- [ ] **Step 3: Compose in `App.tsx`** — add `useState<string>('Logs')` for `activeNav` and `useState(false)` for `settingsOpen`. Inside the card, port the BODY flex (line 60) and main column wrapper (line 74). Render `<TitleBar />`, then a flex row with `<NavRail .../>` and an empty main column placeholder.

- [ ] **Step 4: GATE + visual check** — `npm run typecheck && npm run build`, then `wails dev`. Expect: traffic lights + brand + avatar title bar (draggable), left nav rail with Logs active (teal), settings gear at bottom.

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "feat: TitleBar + NavRail + app layout frame"
```

---

## Task 4: QueryTabs

**Files:** Create `frontend/src/components/QueryTabs.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `TABS`, `STREAMS` (for dot color via `STREAM_COLORS`), `QueryTab`.
- Produces: `<QueryTabs tabs, activeId, onPick, onNew />` — `tabs: QueryTab[]`, `activeId: string`, `onPick: (id:string)=>void`, `onNew: ()=>void`. (Inline rename is visual-deferred in M1: render names as static text; keep `onDoubleClick` as a no-op prop so markup parity holds.)

- [ ] **Step 1:** Port markup from `design/Observe.dc.html` lines 77–91 (tab strip, each tab with stream dot + name, the `+` new button). Move computed `tabStyle`/`dotStyle` to CSS Module classes; active tab variant toggled by `activeId === t.id`. Dot color = `STREAM_COLORS[t.stream]` (inline `style={{ background: color }}` is acceptable for data-driven color).
- [ ] **Step 2:** In `App.tsx` add `tabs` (from `TABS`) and `activeTab` state; render `<QueryTabs/>` at the top of the main column.
- [ ] **Step 3:** GATE + visual check — horizontal scrollable tab strip with colored dots, active tab highlighted, `+` button on the right.
- [ ] **Step 4:** Commit — `git commit -m "feat: QueryTabs strip"`.

---

## Task 5: QueryEditor (control row + editor + hint line)

**Files:** Create `frontend/src/components/QueryEditor.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `highlight` from format.ts; `LogRow`/query state from App.
- Produces: `<QueryEditor query, queryMode, showHistogram, running, timeRange, onModeChange, onToggleHisto, onToggleTime, onRun, onToggleHistory, onToggleGuide, onQueryChange />`. All handlers `() => void` except `onModeChange:(m:QueryMode)=>void` and `onQueryChange:(s:string)=>void`. Renders slots (children/props) for `<TimeRangePicker/>` (Task 6), `<HistoryDropdown/>` and `<Autocomplete/>` (Task 7) — accept them as optional `ReactNode` props `timePicker`, `historyPanel`, `autocomplete` so App wires open/close state.

- [ ] **Step 1:** Port the control row (lines 95–157): SQL/search segmented toggle (line 97–101), histogram toggle (lines 102–105 — knob style as `.toggle`/`.toggleOn` + `.knob`), the time button (lines 108–113, opens picker), the Run button (lines 150–156 with spinner `sc-if running` → CSS `@keyframes ooPulse`).
- [ ] **Step 2:** Port the editor row (lines 159–167): line-number gutter (`lineNos` = `query.split('\n').map((_,i)=>i+1)`), the highlighted `<pre>` rendering `highlight(query)` as colored `<span>`s, and the transparent overlaid `<textarea>` (color transparent, caret `var(--accent)`). `onChange` → `onQueryChange`.
- [ ] **Step 3:** Port the hint line (lines 168–207 minus the dropdown bodies): `⌘↵ run`, `Tab accept`, `↑↓ navigate`, the `history` button (toggles), and the `? syntax guide` button (toggles). Render `props.historyPanel` / `props.autocomplete` where their anchors are.
- [ ] **Step 4:** In `App.tsx`: add state `query` (seed from active tab's `q`), `queryMode`('sql'), `showHistogram`(true), `running`(false), `timeRange`('Past 15 Minutes'), `historyOpen`, `suggestOpen`, `guideOpen`, `timeOpen`. Render `<QueryEditor/>` below tabs.
- [ ] **Step 5:** GATE + visual check — editor shows highlighted SQL with gutter; toggles and buttons render; SQL pill active.
- [ ] **Step 6:** Commit — `git commit -m "feat: QueryEditor (toggle, editor, hint line)"`.

---

## Task 6: TimeRangePicker

**Files:** Create `frontend/src/components/TimeRangePicker.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `QUICK_RANGES`, `TimeTab`.
- Produces: `<TimeRangePicker open, tab, quickRanges, relAmount, relUnit, absFrom, absTo, onPickQuick, onSetTab, onRelAmount, onRelUnit, onApplyRelative, onAbsFrom, onAbsTo, onApplyAbsolute />`. Pure presentational popover; `open` gates render.

- [ ] **Step 1:** Port lines 114–158 (the popover): left quick-ranges column (`QUICK_RANGES`), right pane with Relative/Absolute segmented tabs, relative amount input + unit buttons (`relUnits`), absolute From/To inputs + `YYYY-MM-DD HH:mm:ss · Asia/Shanghai` note, Apply buttons. Convert computed styles to classes with active variants.
- [ ] **Step 2:** In `App.tsx` add `timeTab`('relative'), `relAmount`('15'), `relUnit`('m'), `absFrom`/`absTo` state; pass into `<QueryEditor timePicker={<TimeRangePicker .../>} />`.
- [ ] **Step 3:** GATE + visual check — clicking the time button opens the 432px popover; both tabs render their forms.
- [ ] **Step 4:** Commit — `git commit -m "feat: TimeRangePicker popover"`.

---

## Task 7: HistoryDropdown + Autocomplete

**Files:** Create `frontend/src/components/HistoryDropdown.{tsx,module.css}`, `frontend/src/components/Autocomplete.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `HISTORY`, `HistoryItem`, `Suggestion`, `computeSuggestions` logic.
- Produces:
  - `<HistoryDropdown open, items, onPick, onClose />` (`items: HistoryItem[]`).
  - `<Autocomplete open, currentWord, suggestions, activeIndex, onSelect, onHover />` (`suggestions: Suggestion[]`).

- [ ] **Step 1:** Port `HistoryDropdown` from lines 178–204 (header "Recent queries" + count, scrollable list with preview/ago/stream/meta).
- [ ] **Step 2:** Port `Autocomplete` from lines 208–227 (header `SUGGESTIONS · "word"` + count, list rows with kind badge `tag`, label, detail). For M1 static, compute `suggestions` once from a fixed `currentWord` (e.g. derive from the seeded query) via a `computeSuggestions(word)` helper added to `format.ts` (port lines 868–877) — or pass a static slice of FUNCS/FIELDS. Keep it visual.
- [ ] **Step 3:** Wire both into `App.tsx` through `QueryEditor`'s `historyPanel`/`autocomplete` props, gated by `historyOpen`/`suggestOpen`.
- [ ] **Step 4:** GATE + visual check — history button opens recent-queries panel; autocomplete panel renders with badges.
- [ ] **Step 5:** Commit — `git commit -m "feat: query history + autocomplete dropdowns"`.

---

## Task 8: FieldsPanel (+ collapsed strip)

**Files:** Create `frontend/src/components/FieldsPanel.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `STREAMS`, `FIELDS`, `StreamInfo`, `Field`.
- Produces: `<FieldsPanel collapsed, stream, streamOpen, streams, fields, fieldFilter, onToggleCollapse, onToggleStream, onPickStream, onFieldFilter, onInsertField />`. When `collapsed`, render the 34px strip (lines 281–289) instead.

- [ ] **Step 1:** Port the expanded panel (lines 233–280): stream selector button + dropdown (`streams` with size), field filter input (`fieldFilter` + count), field list (`fields` filtered by `fieldFilter`, each row with type glyph/icon, name, type). Glyph/icon color by field type (string/int/datetime) — reproduce from the design's `f.icon`/`f.glyph` computation.
- [ ] **Step 2:** Port the collapsed strip (lines 281–289) with the vertical "Stream & fields" label and expand button.
- [ ] **Step 3:** In `App.tsx` add `sidebarCollapsed`(false), `stream`('demo_logs'), `streamOpen`, `fieldFilter`(''); render `<FieldsPanel/>` as the left column of the workspace flex.
- [ ] **Step 4:** GATE + visual check — fields sidebar with stream dropdown, filter, and field rows; collapse toggles to the vertical strip.
- [ ] **Step 5:** Commit — `git commit -m "feat: FieldsPanel + collapsed strip"`.

---

## Task 9: Histogram

**Files:** Create `frontend/src/components/Histogram.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `histogramBars` from format.ts.
- Produces: `<Histogram show />` — when `show`, renders the chart header ("Event volume", "30s buckets", "peak 7,323") and the bar row from `histogramBars()`; bars use `linear-gradient(180deg, var(--accent), hexA(accent,0.32))` (design line 916) and the time-axis labels (line ~918: `['13:44',…,'13:58']`).

- [ ] **Step 1:** Port lines 292–304: header row + the `{{ histogram }}` bar render (lines 901–935 in the script). Each bar height = `bar.h * 100%`. Add the x-axis labels.
- [ ] **Step 2:** In `App.tsx` render `<Histogram show={showHistogram} />` at the top of the center column.
- [ ] **Step 3:** GATE + visual check — teal gradient bar chart with peak label and time axis; hides when histogram toggle is off.
- [ ] **Step 4:** Commit — `git commit -m "feat: event-volume histogram"`.

---

## Task 10: ResultsHeader + ResultsTable

**Files:** Create `frontend/src/components/ResultsHeader.{tsx,module.css}`, `frontend/src/components/ResultsTable.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `LOGS`, `LogRow`, `Density`.
- Produces:
  - `<ResultsHeader shownCount, totalEvents, queryMs />` (static counts + pagination from design).
  - `<ResultsTable rows, selectedId, density, onSelectRow, onLevelCtx, onServiceCtx />` — `rows: LogRow[]`, `density: Density`, `onSelectRow:(id:string)=>void`, `onLevelCtx`/`onServiceCtx:(field:string,value:string,e:React.MouseEvent)=>void`.

- [ ] **Step 1:** Port `ResultsHeader` from lines 306–323 (showing 1–N of total, query ms `var(--accent)`, scan, tz, pagination 1/2/3). Use static values from the design (e.g. `shownCount=50`, `totalEvents='402,170'`, `queryMs=247`).
- [ ] **Step 2:** Port the column header (lines 324–332) and rows (lines 333–348): chevron, time, level badge (color by level — port `levelStyle`), service (clickable → `onServiceCtx`), message (ellipsis). Row padding from `density` (`dense` → tighter). Selected row highlighted via `selectedId`. **Do not** port the inline-inspector block (removed from design).
- [ ] **Step 3:** In `App.tsx` add `selectedRow` state (`string | null`), `density`('ultra'); render `<ResultsHeader/>` then a scrollable `<ResultsTable/>` in the center column.
- [ ] **Step 4:** GATE + visual check — dense rows with colored level badges; clicking a row marks it selected.
- [ ] **Step 5:** Commit — `git commit -m "feat: results header + table"`.

---

## Task 11: DrawerInspector

**Files:** Create `frontend/src/components/DrawerInspector.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: selected `LogRow`.
- Produces: `<DrawerInspector row, onClose, onKvCtx />` — render only when `row` is non-null; `onKvCtx:(field:string,value:string,e:React.MouseEvent)=>void`.

- [ ] **Step 1:** Port lines 349–377 (the 432px right drawer): header with level badge + "Log record" + copy + close, timestamp line, scrollable JSON kv list (`row.json`) with `ooDrawer` entry animation. kv value color by `kind` (str/num). Each kv clickable → `onKvCtx`.
- [ ] **Step 2:** In `App.tsx` render `{selectedRow && <DrawerInspector row={LOGS.find(r=>r.id===selectedRow)!} onClose={()=>setSelectedRow(null)} .../>}` as the right column of the workspace.
- [ ] **Step 3:** GATE + visual check — selecting a row slides in the JSON drawer; close button clears it.
- [ ] **Step 4:** Commit — `git commit -m "feat: log-record drawer inspector"`.

---

## Task 12: SettingsModal (Connection / Appearance / Agent·MCP / About)

**Files:** Create `frontend/src/components/SettingsModal.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `SettingsTab`, `Density`; accent swatches.
- Produces: `<SettingsModal open, tab, accent, density, mcpOn, conn, onClose, onTab, onPickAccent, onPickDensity, onToggleHisto, onToggleMcp, onConnField />` where `conn: { url:string; org:string; email?:string }`.

- [ ] **Step 1:** Port the modal shell (lines 379–397 + closing 561–566): overlay (`rgba(4,5,7,.62)` + blur), 800×600 panel, left tab list (`setTabs`), right scroll body.
- [ ] **Step 2:** Port **Connection** (lines 398–460): status card (`conn.url`, org, version), Server URL / Organization / token fields, Test & save / Re-run setup buttons.
- [ ] **Step 3:** Port **Appearance** (lines 461–489): Accent swatches (4 colors → `onPickAccent`, updates `--accent`), Row density segmented (`densityTabs` → `onPickDensity`), "Show histogram by default" toggle. (No layout switcher — it was removed.)
- [ ] **Step 4:** Port **Agent · MCP** (lines 490–534): expose-server toggle, endpoint/token cards, the `claude mcp add` snippet, default-leash tabs, max-scan/rows cards. Gate the body on `mcpOn`.
- [ ] **Step 5:** Port **About** (lines 535–559): brand card, tagline, version line — **relabel "Tauri 2.0" → "Wails v2"** — and the doc links.
- [ ] **Step 6:** In `App.tsx` add `settingsTab`('connection'), `accent`('#2dd4bf'), `mcpOn`(false), `conn` mock; on accent pick, set `document.documentElement.style.setProperty('--accent', c)`. Render `<SettingsModal open={settingsOpen} .../>`.
- [ ] **Step 7:** GATE + visual check — gear opens modal; all four tabs render; accent swatch changes the whole UI accent; density toggle present.
- [ ] **Step 8:** Commit — `git commit -m "feat: settings modal (connection/appearance/agent/about)"`.

---

## Task 13: SetupWizard (first-launch)

**Files:** Create `frontend/src/components/SetupWizard.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Produces: `<SetupWizard open, conn, authTab, tested, selfSigned, onAuthTab, onField, onToggleSelfSigned, onTest, onClose />` — `authTab: 'password'|'token'|'sso'`.

- [ ] **Step 1:** Port lines 560–632 (the full-screen wizard): left brand panel (gradient, steps 1–3) + right connect form (Server URL, Organization, auth segmented tabs, password/token/SSO conditional blocks, self-signed toggle, Test button + reachable note, Connect/Skip buttons, keychain note).
- [ ] **Step 2:** In `App.tsx` add `setupOpen`(false by default in M1 — do not auto-open; it's reachable via Connection's "Re-run setup wizard…"), `authTab`('password'), `tested`(false), `selfSigned`(false). Render `<SetupWizard open={setupOpen} .../>` as a top-level overlay.
- [ ] **Step 3:** GATE + visual check — triggering setup shows the two-pane wizard; auth tabs switch the credential fields.
- [ ] **Step 4:** Commit — `git commit -m "feat: first-launch setup wizard"`.

---

## Task 14: ValueActionMenu + SyntaxGuide

**Files:** Create `frontend/src/components/ValueActionMenu.{tsx,module.css}`, `frontend/src/components/SyntaxGuide.{tsx,module.css}`; Modify `App.tsx`.

**Interfaces:**
- Consumes: `GUIDE`, `GuideSection`.
- Produces:
  - `<ValueActionMenu open, field, value, x, y, items, onPick, onClose />` — `items: {icon:string;label:string}[]`, positioned at `x,y`.
  - `<SyntaxGuide open, sections, onClose, onUse />` — `sections: GuideSection[]`.

- [ ] **Step 1:** Port `ValueActionMenu` (lines 634–651): fixed backdrop + positioned menu, header (`field`/`value`), action items (add filter `=`/`≠`, group by, top values, copy — from `ctxItems`). Position via inline `style={{ left:x, top:y }}` (data-driven).
- [ ] **Step 2:** Port `SyntaxGuide` (lines 653–683): overlay + 720px panel, 2-col grid of `GUIDE` sections, each item a clickable snippet (`code` + `note`).
- [ ] **Step 3:** In `App.tsx` add `ctxMenu` state (`{open,field,value,x,y} | null`) wired from `ResultsTable`/`DrawerInspector` `onLevelCtx`/`onServiceCtx`/`onKvCtx`; render both overlays. `guideOpen` already exists (Task 5).
- [ ] **Step 4:** GATE + visual check — clicking a level/service/kv opens the action menu at the cursor; `? syntax guide` opens the guide overlay.
- [ ] **Step 5:** Commit — `git commit -m "feat: value action menu + syntax guide overlay"`.

---

## Task 15: Final assembly, full-screen visual parity pass, README

**Files:** Modify `App.tsx`, `App.module.css`; Create `README.md`.

- [ ] **Step 1:** Review `App.tsx` — confirm the full tree composes (TitleBar, NavRail, QueryTabs, QueryEditor[+TimeRangePicker, HistoryDropdown, Autocomplete], FieldsPanel, Histogram, ResultsHeader, ResultsTable, DrawerInspector, SettingsModal, SetupWizard, ValueActionMenu, SyntaxGuide) with all state owned here. Remove any leftover placeholders.
- [ ] **Step 2:** Side-by-side parity check — open `design/Observe.dc.html` in a browser and `wails dev`; compare default state and each overlay. Fix spacing/color drift. Confirm: no layout switcher anywhere; single right drawer; density toggle works.
- [ ] **Step 3:** Write `README.md`: prerequisites (Go 1.24+, Node 20+, `wails` CLI), `wails dev` / `wails build`, note M1 is static (mock data) and M2 will wire `pkg/apiclient` via `go.work`, and the auth-helper open item.
- [ ] **Step 4:** Full GATE + build: `cd frontend && npm test && npm run typecheck && npm run build && cd .. && wails build`. Expected: tests pass, build succeeds.
- [ ] **Step 5:** Commit — `git commit -m "feat: assemble Logs screen + README (M1 complete)"`.

---

## Self-Review

**Spec coverage:** stack/shell (Task 1) ✓; module path + go.work (Task 1) ✓; types/mock/helpers (Task 2) ✓; all five surfaces — Logs screen (Tasks 3–11), Settings (12), setup wizard (13), value menu + syntax guide (14) ✓; right-drawer-only inspector + density retained (Tasks 10–12) ✓; accent var + swatches (Task 12) ✓; About relabel (Task 12) ✓; M2 documented (README, Task 15) ✓; verification approach (per-task GATE + Vitest for helpers) ✓.

**Placeholder scan:** No "TBD"/"implement later". Markup is sourced by exact design line ranges into the committed `design/Observe.dc.html` (intentional, not a placeholder) with a full worked example in Task 3 establishing the pattern. Pure-logic task (2) has complete test + porting references.

**Type consistency:** Component prop names and `types.ts` identifiers are used consistently across tasks (`selectedRow`/`onSelectRow`, `drawerOpen` derived from `selectedRow`, `density`, `accent`, `QueryMode`, `SettingsTab`, `TimeTab`). Helper signatures (`hexA`, `histogramBars`, `highlight`, `computeSuggestions`) match between Task 2 and consumers (Tasks 5, 7, 9).
