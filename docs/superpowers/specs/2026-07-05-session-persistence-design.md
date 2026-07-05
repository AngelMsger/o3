# o3 Session Persistence — Design Spec

**Goal:** Persist o3's runtime workspace state (open tabs with their queries + selected streams, active tab, active nav view, time range, histogram toggle, sidebar state) so a relaunch resumes exactly where the user left off.

**Status:** Approved design (2026-07-05). Ready for implementation planning.

## Context

o3 is a [Wails v2](https://wails.io/) (Go + React/TS) macOS desktop client for OpenObserve. Today it already persists UI *preferences* (theme/accent/density) via `internal/config/prefs.go`, an o3-owned store at `os.UserConfigDir()/o3/prefs.json` (`~/Library/Application Support/o3/prefs.json` on macOS), deliberately separate from the shared `openobserve-cli` config (`~/.angelmsger/openobserve/config.yaml`, which holds connection contexts and is never read/written by o3's prefs store).

What is *not* persisted today is the working session: the query tabs, their SQL/search text, the selected stream per tab, and assorted view state. Closing o3 loses all of it.

The active *context* (backend) is already persisted by the CLI's `config.yaml` (`CurrentContext`), so on relaunch the same backend is active. This means a single **global** session is correct — restored per-tab streams stay valid because the backend is unchanged. Per-context session (a distinct tab set per backend) is a deliberate non-goal for v1.

## Decisions (locked)

- **Location:** `~/Library/Application Support/o3/session.json`, a new file next to the existing `prefs.json`. No migration. (macOS-idiomatic `os.UserConfigDir()`; consistent with `prefs.go`.)
- **Separate store, not an extension of `Prefs`:** settings and volatile runtime state have different lifecycles and change frequencies; a corrupt tab blob must never be able to wipe the user's theme.
- **Global session** (not per-context) for v1.
- **No auto-run on restore** for v1: tabs restore their query text; the user hits Run. (Auto-running the active tab is a possible later enhancement.)

## Architecture

Mirror the proven `prefs.go` pattern exactly — a sibling store in `internal/config`, with Wails bindings on `app.go`, driven from `App.tsx` by a load-once-on-startup + debounced-autosave cycle.

### 1. Store & schema — `internal/config/session.go`

```go
type Session struct {
    Version          int          `json:"version"`          // = 1, for future migration
    Tabs             []SessionTab `json:"tabs"`
    ActiveTab        string       `json:"activeTab"`
    ActiveNav        string       `json:"activeNav"`        // "Logs" | "Metrics" | ...
    TimeRange        string       `json:"timeRange"`        // e.g. "Past 15 Minutes"
    ShowHistogram    bool         `json:"showHistogram"`
    SidebarCollapsed bool         `json:"sidebarCollapsed"`
}

type SessionTab struct {
    ID     string `json:"id"`
    Name   string `json:"name"`
    Mode   string `json:"mode"`   // "sql" | "search"
    SQL    string `json:"sql"`
    Search string `json:"search"`
    Stream string `json:"stream"`
}
```

Same on-disk discipline as `prefs.go`:
- atomic write (temp file in the same dir, `Chmod 0600`, `Rename` over the target);
- dir created with `0700`;
- `LoadSession()` / `SaveSession(Session)` public functions;
- missing file is not an error — returns the default session.

`currentSessionVersion = 1`.

### 2. Wails bindings — `app.go`

```go
func (a *App) GetSession() (config.Session, error) { return config.LoadSession() }
func (a *App) SaveSession(s config.Session) error  { return config.SaveSession(s) }
```

Regenerate bindings (`wails generate module`); restore mode-bit churn afterward (`git checkout -- frontend/wailsjs/runtime/ go.mod go.sum`) and verify the sibling repo is clean; never `go work sync`.

### 3. What is persisted (and what is not)

**Persisted:** every tab (`id`, `name`, `mode`, `sql`, `search`, `stream`); the active tab id; the active nav view; the time-range label; the histogram toggle; sidebar-collapsed.

**Not persisted:** transient UI (open dropdowns/modals, setup/settings visibility, running flag), query *results* (not cached — re-run on demand), and — critically — **no secrets** (credentials stay in the OS keychain; queries carry no tokens). Queries may contain user filter values; these are stored in plaintext JSON on the user's own machine, the same trust model as shell history. `0600` perms apply.

### 4. Save / restore timing — `App.tsx`

- **Restore:** on mount, call `GetSession()` once; hydrate `tabs`, `activeTab`, `activeNav`, `timeRange`, `showHistogram`, `sidebarCollapsed` from it. Gated by a `sessionLoaded` ref so the autosave effect cannot fire (and overwrite the file with initial defaults) before the load completes — the exact pattern `prefsLoaded` already uses.
- **Save:** a debounced (~600 ms) autosave effect keyed on the persisted slice; plus a best-effort synchronous flush on `beforeunload`. No per-keystroke disk writes.
- **Tab-id continuity:** on restore, seed the `tabSeq` new-tab counter past the highest restored id so freshly created tabs never collide with restored ones.

### 5. Robustness / normalization

`LoadSession()` never returns a state the UI cannot render:
- missing file → `defaultSession()`: one empty `untitled` tab, `ActiveNav="Logs"`, `TimeRange="Past 15 Minutes"`, `ShowHistogram=true`, `SidebarCollapsed=false`;
- corrupt JSON or an unknown/newer `Version` → same defaults (log-and-reset, never crash);
- present-but-degenerate file → normalize: empty `Tabs` gets one default tab; an `ActiveTab` that matches no tab falls back to `Tabs[0].ID`; a tab with an empty `Mode` defaults to `"sql"`.

Stale streams (a persisted `Stream` that no longer exists in the current backend) are tolerated: the tab restores and the user re-picks the stream. No validation call against the backend at load time.

## Components & boundaries

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| `internal/config/session.go` | Typed load/save + defaults/normalization + atomic write | stdlib only (mirrors `prefs.go`) |
| `app.go` `GetSession`/`SaveSession` | Wails binding surface | `internal/config` |
| `App.tsx` session hook | Hydrate on load, debounced autosave, `beforeunload` flush | generated bindings |

Each is independently testable: the Go store via unit tests; the binding via type-check + build; the frontend mapping via a small serialize/deserialize test.

## Testing

Go unit tests mirroring `prefs_test.go`:
- round-trip (`SaveSession` then `LoadSession` returns an equal value);
- missing file → defaults;
- corrupt JSON → defaults;
- unknown/newer `Version` → defaults;
- empty-`Tabs` normalization → one default tab;
- `ActiveTab`-not-found → `Tabs[0].ID`;
- atomic write leaves no `.tmp-*` file behind on success.

Frontend: a unit test for the state↔`Session` mapping (React tab shape ⇄ `SessionTab`), covering the empty-tabs and unknown-active-tab normalization at the boundary.

## Non-goals (v1)

- Per-context / per-backend session sets.
- Auto-running restored queries on launch.
- Caching or restoring query *results*.
- Cross-machine / cloud sync.

## Build-green definition

`go test ./...` green (new session tests included), `cd frontend && npx vitest run` green, `wails build` exit 0; mode-bit churn restored; sibling repo clean; never `go work sync`.
