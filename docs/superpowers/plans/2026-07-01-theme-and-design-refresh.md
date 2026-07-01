# Theme System + Design Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the updated `design/Observe.dc.html` into the o3 app: a full CSS token system with a light/dark/system theme (persisted via a Go backend), the "liquid glass" chrome refresh, and the small design tweaks/bug fixes on already-built surfaces.

**Architecture:** A new o3-owned JSON preferences file (`internal/config/prefs.go`, separate from the shared `openobserve-cli` YAML) stores `theme`/`accent`/`density`. `app.go` exposes `GetPrefs`/`SavePrefs` bindings. The frontend rewrites `src/styles/tokens.css` into dark (`:root`) + light (`:root[data-oo-theme="light"]`) token blocks; all component CSS migrates its hardcoded colors to those tokens. A React theme layer loads prefs on startup, sets `data-oo-theme` on `<html>`, follows `matchMedia('(prefers-color-scheme: dark)')` when the pref is `system`, and persists changes through `SavePrefs`. A Light/Dark/System segmented control is added to Settings → Appearance.

**Tech Stack:** Wails v2 (Go 1.24), React 18 + TypeScript + Vite, CSS Modules, ECharts, CodeMirror 6. Go tests via `go test`; frontend tests via Vitest.

## Global Constraints

- **Scrub is permanent:** the production stream/context identifiers and related tokens MUST NOT appear anywhere. The synced design doc has already been scrubbed to neutral placeholders (streams -> `demo_logs`/`demo_audit`, contexts -> `prod`/`staging`, hostnames -> `example.internal`, worker -> `demo-worker`). Verify the scrub grep for the production prefix is empty before every commit.
- **Never run `go work sync`.** Do not modify the sibling repo `/Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli`. GUI-only prefs live in an o3-owned file, NOT the shared CLI config.
- After any Go-touching or `wails build` command, restore mode-bit churn: `git checkout -- frontend/wailsjs/runtime/ go.mod go.sum` and confirm the sibling repo is clean (`git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain` empty).
- **Exact token values** come from `design/Observe.dc.html` lines 15-68 (dark `:root` + light `:root[data-oo-theme="light"]`). Copy hex values verbatim.
- **On-accent text stays literal `#06181a`** in both themes (accent is always a bright teal). Do NOT tokenize it.
- ASCII half-width punctuation in Chinese content/comments/commits; PascalCase brand/tech terms in prose; open-source mentions get hyperlinks. Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do not merge/push without the user asking.
- Build green = `wails build` exit 0 + `cd frontend && npx vitest run` passing + `go test ./...` passing.

---

## File Structure

**Created:**
- `internal/config/prefs.go` — o3-owned preferences store (load/save JSON at `os.UserConfigDir()/o3/prefs.json`). One responsibility: durable app-level UI prefs.
- `internal/config/prefs_test.go` — round-trip + defaults + missing-file tests.
- `frontend/src/lib/theme.ts` — pure helpers: `effectiveTheme(pref, systemDark)`, `applyThemeAttr(theme)`. Testable without a DOM-heavy harness.
- `frontend/src/lib/theme.test.ts` — unit tests for the pure helpers.

**Modified:**
- `app.go` — add `Prefs` struct + `GetPrefs()`/`SavePrefs(Prefs)` bindings.
- `frontend/src/styles/tokens.css` — dark + light token blocks, glass tokens, tokenized body/scrollbar/selection.
- All 18 `frontend/src/**/*.module.css` — migrate hardcoded colors → tokens.
- `frontend/src/App.tsx` — load prefs on startup; theme state (`themePref`, `systemDark`); apply `data-oo-theme`; matchMedia listener; persist accent/density/theme via `SavePrefs`.
- `frontend/src/components/SettingsModal.tsx` (+ `.module.css`) — Light/Dark/System segmented control in the Appearance panel; wire `themePref`/`onPickTheme`.
- `frontend/src/components/sqlEditorTheme.ts` — read syntax colors from CSS `--sy-*` vars (or accept a theme flag) so the CodeMirror editor recolors with the theme.
- `frontend/src/types.ts` — add `ThemePref = 'light' | 'dark' | 'system'`.
- `design/Observe.dc.html` — replaced by the scrubbed synced version (Phase 0).

---

## Phase 0 — Sync the design doc

**Goal:** Land the scrubbed, updated design doc as the new source of truth. Mechanical; matches the established "sync from Claude Design" commit pattern.

- [ ] **Step 1:** Copy the scrubbed file into place. The prepared, scrubbed file is at `scratchpad/Observe.scrubbed.html` (1729 lines, verified clean of the production prefix). Overwrite `design/Observe.dc.html` with it.
- [ ] **Step 2:** Verify: the scrub grep on `design/Observe.dc.html` returns `0`; `grep -c 'data-oo-theme' design/Observe.dc.html` → ≥2.
- [ ] **Step 3:** Commit.

```bash
git add design/Observe.dc.html
git commit -m "design: sync theme + glass refresh from Claude Design (scrubbed)"
```

---

## Phase 1 — Token foundation (tokens.css)

**Goal:** Replace the accent-only `tokens.css` with the full dark + light token system. After this phase the app still looks identical (components still use hardcoded colors), but every token is available and the `data-oo-theme` switch is wired at the CSS layer.

**Files:** Modify `frontend/src/styles/tokens.css`.

**Interfaces produced:** CSS custom properties `--ink`, `--glow`, `--sf-*`, `--tx-*`, `--gg-*`, `--av-*`, `--sy-*`, `--glass-*` (values per `design/Observe.dc.html:15-68`), plus the retained `--accent` and `--motion-*` tokens. `--ink`/`--glow` are RGB triples used as `rgba(var(--ink), <alpha>)`.

- [ ] **Step 1:** In `tokens.css`, keep `--accent: #2dd4bf;` and the `--motion-*` block. Add the full dark token set inside `:root` (copy `design/Observe.dc.html:17-43` verbatim — surfaces, neutral text, green-gray, avatar, syntax, glass).
- [ ] **Step 2:** Add `:root[data-oo-theme="light"] { ... }` with the light values (copy `design/Observe.dc.html:47-67` verbatim).
- [ ] **Step 3:** Default the document to dark: the app sets `data-oo-theme` at runtime, but add `:root { color-scheme: dark; }` in the dark block and `:root[data-oo-theme="light"] { color-scheme: light; }` so native form controls/scrollbars match.
- [ ] **Step 4:** Retokenize the global rules already in this file: `body` background → `radial-gradient(120% 120% at 80% -10%, rgba(var(--glow),.10) 0%, transparent 55%), var(--sf-desk)` with `transition: background .25s ease` (per design:71-75); `::selection` → `rgba(45,212,191,.28)` (keep — accent-based); scrollbar thumb `rgba(255,255,255,.09/.16)` → `rgba(var(--ink),.14/.24)` (per design:78-79). Keep keyframes and Wails drag helpers unchanged.
- [ ] **Step 5:** Run `cd frontend && npx vitest run` (should still pass — no test depends on these) and `npm run build` (Vite typecheck/build) to confirm CSS parses.
- [ ] **Step 6:** Commit.

```bash
git add frontend/src/styles/tokens.css
git commit -m "feat: add dark/light CSS token system to tokens.css"
```

---

## Phase 2 — Migrate component CSS to tokens

**Goal:** Replace the ~380 hardcoded color literals across the 18 CSS modules with token references so light mode actually takes effect. This is a deterministic mapping with a small judgment tail.

**Files:** All `frontend/src/**/*.module.css`.

**Mapping rules (apply in order):**
1. **Dark-token hexes → `var(--token)`.** Build the map from `design/Observe.dc.html:20-38` (each `--name:#hex`). Every CSS-module hex that equals a dark token value becomes `var(--<name>)`. (Covers ~276 occurrences / 46 distinct hexes.) Case-insensitive match; lowercase the hex before lookup.
2. **`#2dd4bf` → `var(--accent)`** (69 occurrences). Where the existing code already has `var(--accent, #2dd4bf)`, leave it.
3. **`rgba(255,255,255,<a>)` → `rgba(var(--ink),<a>)`** (hairlines/overlays). Same alpha preserved.
4. **`#fff`/`#ffffff` used as a translucent overlay base → `rgba(var(--ink),<a>)`** where it appears inside an `rgba`/opacity context; leave any genuinely-opaque white (rare) as a literal and note it.
5. **Body/panel gradient stops** (`#11141b`, `#06070a`, `#04050700`, `#0d1017`, `#1e2530`, `#161b23`) → match the design's new gradient form (`rgba(var(--glow),.10)` + `var(--sf-desk)`), or the nearest `--sf-*` token for panel gradients. Decide per occurrence against the design.
6. **Keep literal (do NOT tokenize):** on-accent text `#06181a`; the macOS traffic-light dots `#ff5f57`/`#febc2e`/`#28c840`; severity/stream semantic colors (`#34e0a1`, `#f4a39c`, `#f5b340`, `#c8b083`, `#7c8696`, `#f4685f`) unless the design assigns them a `--sy-*`/`--gg-*` token at that spot — check the design's equivalent element before deciding.

**Per-file loop (one task per file; a file is independently reviewable):** For each `*.module.css`:
- [ ] **Step 1:** Apply rules 1-3 (deterministic) via the hex→token map.
- [ ] **Step 2:** Hand-resolve rules 4-6 against the design element (grep the design for the same component's colors when unsure).
- [ ] **Step 3:** Verify no dark-token hex literals remain: `grep -iE '#(0b0d11|0e1116|cfd6e4|...)' <file>` empty for mapped hexes; `grep -c 'rgba(255' <file>` → 0.
- [ ] **Step 4:** After all files: `cd frontend && npx vitest run` green; `npm run build` succeeds.

**Also migrate inline styles that hardcode tokenized colors** in `SettingsModal.tsx` (e.g. `color: '#dde3ee'` at lines ~351/370, `boxShadow: '0 0 0 2px #0a0c11...'` at ~360) → `var(--tx-01)`, `var(--sf-main)`. Grep TSX for `#0a0c11`, `#dde3ee`, `#0e1116` and convert.

- [ ] **Step 5 (commit, may be split per batch of files):**

```bash
git add frontend/src
git commit -m "refactor: migrate component CSS to theme tokens"
```

**Verify (live):** `wails dev` — dark mode looks pixel-identical to before. (Light mode is verified after Phase 5 wires the switch.)

---

## Phase 3 — Go preferences backend

**Goal:** Durable, o3-owned storage for `theme`/`accent`/`density`, exposed to the frontend. Separate from the shared CLI config.

**Files:** Create `internal/config/prefs.go`, `internal/config/prefs_test.go`; modify `app.go`.

**Interfaces produced (consumed by Phase 4):**
- Go: `type Prefs struct { Theme string; Accent string; Density string }` (JSON tags `theme`/`accent`/`density`).
- `func LoadPrefs() (Prefs, error)` — reads `os.UserConfigDir()/o3/prefs.json`; on missing file returns defaults `{Theme:"dark", Accent:"#2dd4bf", Density:"ultra"}` with nil error.
- `func SavePrefs(p Prefs) error` — `MkdirAll` the dir (0o700) and write the file (0o600) atomically.
- Wails bindings on `App`: `GetPrefs() (config.Prefs, error)`, `SavePrefs(p config.Prefs) error`. Generated TS: `GetPrefs()`, `SavePrefs(p)` in `frontend/wailsjs/go/main/App.js`.

- [ ] **Step 1 (test first):** Write `prefs_test.go`: (a) `LoadPrefs` on a temp dir with no file returns the defaults; (b) `SavePrefs` then `LoadPrefs` round-trips a non-default `Prefs`; (c) unknown/extra JSON keys don't error. Use a `t.Setenv`-overridable dir helper or inject the base dir so tests don't touch the real config dir.

```go
func TestLoadPrefsDefaultsWhenMissing(t *testing.T) {
    dir := t.TempDir()
    p, err := loadPrefsFrom(dir)
    if err != nil { t.Fatal(err) }
    if p.Theme != "dark" || p.Accent != "#2dd4bf" || p.Density != "ultra" {
        t.Fatalf("want defaults, got %+v", p)
    }
}
func TestSaveLoadRoundTrip(t *testing.T) {
    dir := t.TempDir()
    want := Prefs{Theme: "system", Accent: "#7c83ff", Density: "cozy"}
    if err := savePrefsTo(dir, want); err != nil { t.Fatal(err) }
    got, err := loadPrefsFrom(dir)
    if err != nil { t.Fatal(err) }
    if got != want { t.Fatalf("round-trip: want %+v got %+v", want, got) }
}
```

- [ ] **Step 2:** Run `go test ./internal/config/ -run Prefs -v` → FAIL (undefined).
- [ ] **Step 3:** Implement `prefs.go`: `Prefs` struct; internal `loadPrefsFrom(dir)`/`savePrefsTo(dir)` taking a base dir (for tests); public `LoadPrefs`/`SavePrefs` that resolve `filepath.Join(os.UserConfigDir(), "o3")` and delegate. `LoadPrefs` applies defaults for empty fields (so a partial file still yields valid prefs). Validate `Theme` ∈ {light,dark,system} else fall back to `dark`.
- [ ] **Step 4:** Run `go test ./internal/config/ -run Prefs -v` → PASS.
- [ ] **Step 5:** In `app.go`, add `func (a *App) GetPrefs() (config.Prefs, error) { return config.LoadPrefs() }` and `func (a *App) SavePrefs(p config.Prefs) error { return config.SavePrefs(p) }`. Regenerate bindings by building: `wails build` (or `wails generate module`). Then restore mode-bit churn.
- [ ] **Step 6:** `go test ./...` green; `git checkout -- frontend/wailsjs/runtime/ go.mod go.sum`; confirm sibling clean.
- [ ] **Step 7:** Commit (include the regenerated `frontend/wailsjs/go/main/App.{js,d.ts}` and `models.ts`).

```bash
git add internal/config/prefs.go internal/config/prefs_test.go app.go frontend/wailsjs/go
git commit -m "feat: add o3-owned prefs store (theme/accent/density) with Go bindings"
```

---

## Phase 4 — Frontend theme state + persistence

**Goal:** Load prefs on startup, apply the theme to `<html>`, follow the system when pref is `system`, and persist theme/accent/density changes.

**Files:** Create `frontend/src/lib/theme.ts` + `theme.test.ts`; modify `frontend/src/App.tsx`, `frontend/src/types.ts`.

**Interfaces produced (consumed by Phase 5):**
- `types.ts`: `export type ThemePref = 'light' | 'dark' | 'system';`
- `theme.ts`: `export function effectiveTheme(pref: ThemePref, systemDark: boolean): 'light' | 'dark'` (returns `pref` unless `system`, then `systemDark ? 'dark' : 'light'`); `export function applyThemeAttr(theme: 'light' | 'dark'): void` (sets `document.documentElement.setAttribute('data-oo-theme', theme)`).
- App state: `themePref: ThemePref`, `setThemePref` that persists; `accent`/`density` setters that persist.

- [ ] **Step 1 (test first):** `theme.test.ts` — `effectiveTheme('dark', true)==='dark'`; `effectiveTheme('light', true)==='light'`; `effectiveTheme('system', true)==='dark'`; `effectiveTheme('system', false)==='light'`.
- [ ] **Step 2:** `npx vitest run src/lib/theme.test.ts` → FAIL.
- [ ] **Step 3:** Implement `theme.ts`. Run test → PASS.
- [ ] **Step 4:** In `App.tsx`: add `ThemePref` state (default `'dark'`) and `systemDark` state seeded from `matchMedia('(prefers-color-scheme: dark)').matches` (guard `typeof matchMedia`). On mount, `GetPrefs()` → set `themePref`, `accent`, `density`; then `applyThemeAttr(effectiveTheme(pref, systemDark))`.
- [ ] **Step 5:** Add an effect that re-applies `applyThemeAttr` whenever `themePref` or `systemDark` changes, and a `matchMedia` `change` listener that updates `systemDark` (cleanup on unmount).
- [ ] **Step 6:** Route mutations through persistence: `const persist = (next: Partial<Prefs>) => SavePrefs({ theme, accent, density, ...next })`. Wrap `setAccent`/`setDensity`/`setThemePref` to call `persist`. Keep the existing `document.documentElement.style.setProperty('--accent', c)` (App.tsx:424).
- [ ] **Step 7:** `npx vitest run` green; `wails dev` — theme persists across relaunch; switching OS appearance flips the app when pref is `system`.
- [ ] **Step 8:** Commit.

```bash
git add frontend/src/lib/theme.ts frontend/src/lib/theme.test.ts frontend/src/App.tsx frontend/src/types.ts
git commit -m "feat: load/persist theme + follow system appearance"
```

---

## Phase 5 — Settings → Appearance theme control

**Goal:** A Light/Dark/System segmented control in the Appearance panel, matching `design/Observe.dc.html:1662-1680` (icons + labels; System has a dot).

**Files:** Modify `frontend/src/components/SettingsModal.tsx` (+ `.module.css`).

**Interfaces consumed:** `themePref: ThemePref`, `onPickTheme: (t: ThemePref) => void` (new props threaded from `App.tsx` → `SettingsModal`).

- [ ] **Step 1:** Add `themePref` + `onPickTheme` to `SettingsModalProps`; pass them from `App.tsx` (`themePref={themePref} onPickTheme={setThemePref}`).
- [ ] **Step 2:** In the Appearance panel (above the Accent swatches, ~line 349), add a "Theme" segmented control: three options `['light','dark','system']` with the design's icons (sun / moon / monitor — copy the SVG paths from design:1665-1669) and labels `Light`/`Dark`/`System`. Active option styled with `hexA(accent,0.18)` + `color: accent` like the existing density segments. Reuse/extend `.densitySeg`/`.densityTab` styles (or add `.themeSeg` mirroring them).
- [ ] **Step 3:** `onClick={() => onPickTheme(k)}` per option.
- [ ] **Step 4:** `npx vitest run` green; `wails dev` — all three modes switch live; light mode renders correctly across every migrated surface (spot-check Logs, Metrics, Settings, TitleBar, SetupWizard, drawers/menus). Fix any missed tokens found here (loop back to Phase 2 for the specific file).
- [ ] **Step 5:** Commit.

```bash
git add frontend/src/components/SettingsModal.tsx frontend/src/components/SettingsModal.module.css
git commit -m "feat: add Light/Dark/System theme control to Appearance settings"
```

---

## Phase 6 — Liquid glass chrome + design tweaks

**Goal:** Apply the `--glass-*` translucent chrome to the surfaces the design changed, plus the small design tweaks / bug fixes on built surfaces.

**Files:** `TitleBar`, `SettingsModal`, `DrawerInspector`, `HistoryDropdown`, `ValueActionMenu`, `SyntaxGuide` `.module.css` (overlays/popovers/modals/title bar); plus targeted TSX/CSS for the tweaks.

- [ ] **Step 1 (glass chrome):** For each translucent chrome surface, adopt the design's pattern: `background: var(--glass-<role>); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); box-shadow: inset 0 1px 0 var(--glass-hi);`. Roles per design: title bar → `--glass-titl` (design:99); popovers/dropdowns → `--glass-pop`; modals (Settings, JSON viewer) → `--glass-modal` (design:822); drawer → `--glass-drawer`; bottom bars → `--glass-bar`. Match each component to the design's element by grepping the design for the component's markup.
- [ ] **Step 2 (design tweaks / bug fixes):** Reconcile the remaining non-color diffs against built surfaces. Known items to check and apply where they touch built UI:
  - Search-mode control label capitalization `search` → `Search` and padding `3px` → `5px 13px` (design ~line where the mode pill renders) in `QueryEditor`.
  - The JSON value viewer modal restructure (design:819-833) — align `DrawerInspector`/JSON modal markup + glass.
  - Any padding/typography deltas surfaced by `diff` on built components (Logs workspace, Settings, TitleBar, SetupWizard). Skip anything under the Traces/Dashboards/Streams/Alerts placeholders and the expanded traces mock (design:1148-1295) — out of scope.
- [ ] **Step 3:** Editor recolor — update `sqlEditorTheme.ts` so CodeMirror syntax colors resolve from `--sy-*` (read via `getComputedStyle` on theme change, or pass the effective theme in) so the editor matches light mode. Verify Cmd+Enter/undo still work.
- [ ] **Step 4:** `npx vitest run` green; `wails build` exit 0; restore mode-bit churn; sibling clean.
- [ ] **Step 5:** Commit.

```bash
git add frontend/src
git commit -m "feat: apply liquid-glass chrome and design tweaks from refreshed design"
```

---

## End-to-end verification

1. The scrub grep for the production prefix (`--exclude-dir=.git`) → empty (design doc + all sources clean).
2. `go test ./...` green (prefs round-trip).
3. `cd frontend && npx vitest run` green (existing suites + `theme.test.ts`).
4. `wails build` exit 0 → `git checkout -- frontend/wailsjs/runtime/ go.mod go.sum`.
5. `git status --porcelain` shows only intended files; sibling repo clean; `go work sync` never run.
6. `wails dev` live pass: (a) theme defaults to persisted value; (b) Light/Dark/System switch live from Settings → Appearance; (c) `system` follows OS appearance changes; (d) accent + density now persist across relaunch; (e) light mode renders correctly on Logs, Metrics, Settings, TitleBar, SetupWizard, drawers, dropdowns, value-action menu, JSON viewer; (f) glass chrome on title bar/modals/popovers; (g) CodeMirror editor recolors with the theme.
7. Each phase committed separately; branch finished via `superpowers:finishing-a-development-branch` (present the 4 options; do not merge/push without the user choosing).

## Self-Review notes

- **Spec coverage:** theme system (P1-P5), Go persistence per user's choice (P3), glass refresh + tweaks (P6), traces explicitly out of scope, scrub enforced (Global Constraints + E2E step 1). ✅
- **Type consistency:** `Prefs{Theme,Accent,Density}` (Go) ↔ `Prefs` (generated TS) ↔ `ThemePref` union; `effectiveTheme`/`applyThemeAttr` signatures stable across P4/P5. ✅
- **Bonus scope flagged:** persisting accent + density (currently reset each launch) rides along with the required theme persistence via the same prefs store — cheap, fixes a real gap. If the reviewer considers it out of scope, it can be dropped from `Prefs` without affecting the theme feature.
