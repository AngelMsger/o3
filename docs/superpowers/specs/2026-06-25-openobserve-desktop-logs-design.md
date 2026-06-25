# o3 — OpenObserve Desktop · Logs Explorer (Design Spec)

Date: 2026-06-25
Status: Approved (brainstorming) — pending written-spec review
Scope: Milestone 1 (M1) — static layout of the Logs explorer screen

## 1. Goal & non-goals

Build a native desktop client for OpenObserve ("o3"), starting with a faithful,
static implementation of the **Logs explorer** screen from the imported Claude
Design comp (`Observe.dc.html`). The defining product constraint is that the GUI
must **reuse the existing Go OpenObserve client** (from the `openobserve-cli`
project) rather than reimplement query/auth logic, so CLI and GUI behavior never
diverge.

This milestone (M1) delivers the **visual layout and light local UI state only** —
no live data, no querying, no real autocomplete/highlighting logic beyond a static
render. Live data is a later milestone (M2), designed for here but not built.

Non-goals (M1):
- No OpenObserve API calls, no auth, no Rust/Go client wiring.
- No routing to other nav-rail destinations (they are inert placeholders).
- No real SQL parsing, fuzzy autocomplete, or query execution.
- No light theme (the comp itself defers it).

## 2. Stack & shell decision

- **Shell:** [Wails v2](https://wails.io) — a Go backend + system-webview frontend,
  the Go-stack equivalent of Tauri. Chosen over Tauri because Tauri's backend is
  Rust; reusing the Go client from Rust would mean reimplementation (the exact
  divergence we want to avoid) or a sidecar process. Wails lets the Go backend
  `import` the client directly.
- **Frontend:** React 18 + TypeScript + Vite (Wails official `react-ts` template),
  styled with **CSS Modules** per component plus a global `tokens.css`. The comp
  uses inline styles plus custom `style-hover`/`style-focus` attributes and
  `@keyframes`/scrollbar rules that inline React styles cannot express; CSS Modules
  reproduce the exact pixel/hex values while making hover/focus real.
- **Window:** frameless (`Frameless: true`), macOS hidden-titlebar / full-size
  content, so the React `TitleBar` provides the macOS traffic-light chrome shown in
  the comp. The Go `App` struct exists with bound-method stubs but performs no work
  in M1; the UI runs entirely on `frontend/src/data/mock.ts`.
- **Module path:** `github.com/angelmsger/openobserve-desktop` (the on-disk project
  stays `o3`; in Go the module path is just an import identifier, independent of the
  directory name).

## 3. Code-reuse plan (M2 — designed, not built in M1)

The `openobserve-cli` project already exposes its client publicly:

```go
import (
    api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
    cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
    "github.com/angelmsger/openobserve-cli/pkg/transport"
)
```

`pkg/apiclient` provides a `Client` interface (`Search`, `ListStreams`,
`GetStream`, `ListOrgs`, `Ping`, metrics, traces) plus a `Build(BuildParams{...})`
factory; `BuildParams` takes `BaseURL`, `Org`, an `AuthDecorator transport.Decorator`,
`Timeout`, `MaxRetries`. M2 wiring:

- A local **`go.work`** workspace ties `./` (the GUI module) to
  `../oa-cli/src/openobserve-cli` so both build against the same source during dev.
- The Wails `App` struct gains bound methods (`Search`, `ListStreams`, …) that call
  the shared client and return JSON to the frontend; the React mock layer is swapped
  for these bindings.
- **Open item (we own `openobserve-cli`, so we can modify it):** there is no public
  `pkg/auth` yet — `Build` needs an `AuthDecorator`. M2 will either add a small public
  auth helper to the client (preferred — keeps keychain/credential behavior shared
  with the CLI) or, as a stopgap, have the GUI supply a simple header-injecting
  `transport.Decorator` for token/basic auth. Decide at M2 start.

We will not duplicate any query/auth code in the GUI.

## 4. Project layout

```
o3/
├─ go.mod                    module github.com/angelmsger/openobserve-desktop
├─ go.work                   ./  +  ../oa-cli/src/openobserve-cli   (laid down M1, used M2)
├─ main.go                   Wails bootstrap: frameless window, hidden titlebar, embed frontend
├─ app.go                    App struct + bound-method stubs (no-ops in M1)
├─ wails.json
├─ frontend/                 Vite + React + TS
│  ├─ index.html
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ App.tsx             owns local UI state; composes the screen
│  │  ├─ types.ts            shared TS types (LogRow, Field, Stream, Suggestion, …)
│  │  ├─ data/mock.ts        FIELDS, STREAMS, LOGSRC, history, suggestions, guide, quick ranges
│  │  ├─ styles/tokens.css   color/space vars, --accent, keyframes, .oo-scroll
│  │  └─ components/         one folder or *.tsx + *.module.css per component (§5)
│  └─ (vite config, tsconfig, package.json)
└─ docs/superpowers/specs/…  this spec
```

## 5. Component breakdown (Logs screen)

State lives in `App.tsx` via `useState` and flows down as props. No router, no data
layer. "Minimal interactivity" = trivial open/close/select/toggle state that makes
the layout demonstrable.

```
App
├─ TitleBar               traffic lights · o3 brand + "/ Logs" · JD avatar
├─ NavRail               icon buttons (active = Logs) + Settings gear (opens modal)
├─ MainColumn
│  ├─ QueryTabs           saved-query tabs w/ stream dot, inline rename, "+" new
│  ├─ QueryEditor         SQL/search mode toggle · histogram toggle · TimeRangePicker · Run
│  │   ├─ editor          line-number gutter + highlighted <pre> + transparent <textarea>
│  │   ├─ hint line       ⌘↵ run · Tab accept · ↑↓ navigate · history btn · syntax-guide btn
│  │   ├─ HistoryDropdown recent queries (preview, stream, meta, ago)
│  │   └─ Autocomplete    suggestion list (kind badge, label, detail)
│  ├─ Workspace
│  │  ├─ FieldsPanel      stream selector dropdown · field filter · field list (+ collapsed strip)
│  │  ├─ Center
│  │  │  ├─ Histogram      "Event volume · 30s buckets" · seeded bar chart · peak label
│  │  │  ├─ ResultsHeader  showing 1–N of total · query ms · scan · tz · pagination
│  │  │  └─ ResultsTable   column header + rows (chevron, time, level badge, service, message)
│  │  └─ DrawerInspector  right-side log-record JSON drawer (opens on row select)
├─ SettingsModal          left tabs + panels: Connection · Appearance · Agent·MCP · About
├─ SetupWizard            first-launch: brand panel + connect form (URL/org/auth tabs/self-signed)
├─ ValueActionMenu        Graylog-style context menu on field values (add filter, group by, …)
└─ SyntaxGuide            overlay: grid of SQL guide sections (clickable snippets)
```

### Visual fidelity reference
The decoded comp is the source of truth for exact values, committed to the repo at
`design/Observe.dc.html` (latest revision, layout-switcher removed). Key tokens:

- Fonts: `IBM Plex Sans` (UI), `JetBrains Mono` (code/data).
- Accent: CSS var `--accent`, default `#2dd4bf`; swatches `#2dd4bf #7c83ff #f5a86a #5b9dff`.
- Surfaces: app bg `#0a0c11`, panels `#090b0f`/`#0c0e13`, inputs `#0e1116`, borders `rgba(255,255,255,.06–.12)`.
- Level badge colors, stream dot colors (`STREAM_COLORS`), and the seeded histogram
  formula are taken verbatim from the comp's script block.
- Keyframes: `ooPulse`, `ooDrawer`, `ooFade`; `.oo-scroll` custom scrollbar.

### Inspector & density
The earlier three-layout switcher (workbench/split/focus) was **removed** from the
design. There is now a single result-inspection style:
- Selecting a row opens the right-side `DrawerInspector` (`drawerOpen = !!selectedRow`).
  There is no inline/split inspector.
- **Row density** (ultra / comfortable) remains, configured in Appearance settings;
  it adjusts row padding/line-height via a `dense` flag.

## 6. Local UI state (App.tsx)

Static, in-memory only. Representative fields:
`activeNav`, `tabs[]` + `activeTab` + `renamingTab`, `query` + `caret`,
`queryMode` (sql/search), `showHistogram`, `timeOpen` + `timeTab` (rel/abs) +
`relAmount`/`relUnit`/`absFrom`/`absTo`, `historyOpen`, `suggestOpen`,
`stream` + `streamOpen`, `fieldFilter`, `sidebarCollapsed`, `selectedRow`
(drives `drawerOpen`), `settingsOpen` + `settingsTab`, `setupOpen`,
`guideOpen`, `ctxMenu` (open/field/value/position), `accent`, `density`,
`mcpOn`. Handlers mutate this state; none perform I/O.

## 7. Testing & verification (M1)

Static UI, so verification is visual + structural rather than behavioral:
- `wails dev` / `wails build` compiles and launches a frameless window rendering the
  Logs screen.
- The screen matches the comp at the default state (teal accent, histogram on,
  ultra density) and each toggle/overlay (time picker, history, autocomplete, stream
  dropdown, drawer inspector, settings tabs, setup wizard, value menu, syntax guide)
  opens to its designed visual state.
- TypeScript compiles with no errors; components are isolated (each owns its markup +
  `*.module.css`, communicates via typed props).
- No automated DOM tests in M1 (low value for static layout); revisit when behavior
  (M2 querying) lands.

## 8. Milestones

- **M1 (this spec):** Wails shell + React static Logs screen, all surfaces, mock data.
- **M2 (designed, deferred):** `go.work` wiring, `App` bound methods over
  `pkg/apiclient`, auth helper decision, replace mock with live Search/streams/histogram.

## 9. Risks / notes

- Wails requires the Go toolchain + platform webview deps and `wails` CLI; build/run
  may need local setup (documented in README during implementation).
- The comp's About panel reads "Tauri 2.0"; we will relabel it to reflect Wails.
- `internal/` is no longer a concern — the client is already public under `pkg/`.
```
