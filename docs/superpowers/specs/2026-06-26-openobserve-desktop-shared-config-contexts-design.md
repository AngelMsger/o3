# o3 — OpenObserve Desktop · Shared Config + Multi-Context — Design Spec

Date: 2026-06-26
Status: Approved (brainstorming) — pending written-spec review
Scope: Make o3 and `openobserve-cli` share the same on-disk server configuration and
credential store, so a user configures once. Add a kubectl-style multi-context UI
(switcher + manager) per the updated `design/Observe.dc.html`.

## 1. Goal & non-goals

Today o3 reads its own `~/.angelmsger/openobserve-desktop/config.json` (M2 Task 3),
which is invisible to the CLI's `~/.angelmsger/openobserve/config.yaml`. So a user who
configured the CLI still sees o3's setup wizard. This slice makes o3 read and write the
**same** config file the CLI uses (two-way), reusing the CLI's config code so the two
tools cannot diverge — the same "reuse, don't reimplement" rule that drove the
`pkg/auth` extraction. The credential store (OS keychain, service `openobserve-cli`,
account key `host:scheme`) is **already shared** and verified; this slice keeps it.

After this slice: o3 launches → reads `current_context` from the shared `config.yaml` →
finds the matching keychain secret → connects with no wizard; the title-bar switcher
flips between contexts; the CLI sees any context o3 adds/edits/switches.

### Non-goals (deferred)
- `selfSigned` / TLS-skip-verify wiring. The toggle stays UI-only (it was never wired in
  M2, and the CLI config schema has no field for it).
- Persisting per-context `color` (a UI palette assignment only).
- The credential **file fallback** (`~/.angelmsger/openobserve/credentials`). o3 stays
  keychain-only — a desktop GUI always has a keychain. (The CLI keeps its fallback.)
- Importing the CLI's flag/env/.env layering (CLI-specific; o3 reads the file directly).
- Migrating the old `openobserve-desktop/config.json` (M2 is unreleased; the file is
  simply dropped).
- Honoring `defaults.read_only` / `defaults.format` (CLI-specific). o3 reads only
  `defaults.timeout` / `defaults.max_retries` for client construction.

## 2. Decisions (from brainstorming)

- **Two-way sharing** — o3 reads and writes the shared `config.yaml`.
- **Full context switcher** in o3 (title bar + settings manager + wizard), matching the
  updated design.
- **Reuse via a focused `pkg/config` extraction** in the CLI (file model + IO + path +
  context helpers), not a re-implementation of the YAML schema.
- **Keychain stays the shared credential store**; no file-fallback in o3.

## 3. Cross-repo change: `openobserve-cli` → new public `pkg/config`

The CLI's persistence layer is currently in `internal/config` (the layered loader,
the `File` schema, `ReadFile`/`WriteFile`, path helpers). Move the **persistent,
non-CLI-specific** pieces into a public `pkg/config` so o3 can read/write the same file
identically:

`pkg/config` (new, public) exposes at least:
- The persisted **File schema** — `current_context string`, `contexts []NamedContext`
  (`{Name, BaseURL (yaml:"server"), Org, Auth{Scheme, Username}}`), and an optional
  `Defaults{Format, Timeout, MaxRetries, ReadOnly}`. **`defaults:` must be optional** —
  the user's real file omits it.
- `DefaultConfigDir() (string, error)` → `~/.angelmsger/openobserve`.
- `ConfigFilePath(dir string) string`.
- `ReadFile(dir string) (File, bool, error)` — `bool=false` (no error) when absent.
- `WriteFile(dir string, f File) error` — 0700 dir, 0600 file, YAML, secrets never written.
- Context helpers: find current, upsert-by-name, set-current, remove (min 1).

The CLI's `internal/config` keeps its flag/env/dotenv layering (`Load`, `Resolved`,
env binding) and **builds on / re-exports** `pkg/config` (the `internal/auth` →
`pkg/auth` pattern). All existing CLI tests must stay green. Mechanical extraction in a
repo we own.

The keychain account key already comes from `pkg/auth.AccountKey(server, scheme)`
(verified: the live keychain holds `observe.example.com:basic`).

## 4. `o3` module wiring

`go.work` + the existing `replace` already resolve the local sibling. Add the import
`cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"`. Do not run `go work sync`.

## 5. o3 Go backend — files & responsibilities

- **Delete** `internal/config/config.go` + `paths.go` (the JSON store) and their tests.
  **Keep** `internal/config/secret.go` (keychain — unchanged, still shared).
- `app.go` — consume `pkg/config` for all server config; build the client from the
  **current context** + keychain secret + shared `defaults.timeout`/`max_retries`.

### Types
```go
type ContextInfo struct {
    Name, URL, Org, Scheme, Username string
    HasSecret bool   // a secret exists in the keychain for this context
    IsCurrent bool
}
type ConnConfig struct {
    Name, URL, Org, Scheme, Username, Secret string // Secret inbound only
}
```
(Frontend-only `color`/`selfSigned`/`id` are not in these Go types.)

### Bound methods (replace M2's LoadConnection/SaveConnection)
```go
func (a *App) ListContexts() ([]ContextInfo, error)        // from shared config.yaml; HasSecret via keychain
func (a *App) SwitchContext(name string) error             // set current_context, rebuild client
func (a *App) SaveContext(c ConnConfig) error              // upsert by Name into config.yaml (+ keychain); rebuild if current
func (a *App) RemoveContext(name string) error             // remove (min 1) + delete its keychain secret
func (a *App) TestConnection(c ConnConfig) (ConnInfo, error) // unchanged shape; see secret fallback below
func (a *App) ListStreams() ([]StreamInfo, error)          // current context's client (unchanged)
func (a *App) GetFields(stream string) ([]Field, error)    // unchanged
func (a *App) RunQuery(p query.SearchParams) (query.SearchResult, error) // unchanged
```

### Secret-handling rules (important)
- o3 **never sends secrets to the frontend** — `ListContexts` returns `HasSecret`, not
  the secret. The frontend's per-context password/token field starts empty for existing
  contexts; the user types only to change it.
- `SaveContext` writes the keychain secret **only when `c.Secret` is non-empty**;
  an empty secret leaves the existing keychain entry untouched (editing name/org without
  re-entering the password must not wipe the credential).
- `TestConnection` falls back to the stored keychain secret (`LoadSecret(c.URL,
  c.Scheme)`) when `c.Secret` is empty, so "Test" works on an existing context the user
  didn't re-type.
- **Incomplete contexts are not persisted.** A freshly "added" context (empty URL) lives
  in frontend state only; `SaveContext` writes to the shared file once URL + scheme are
  set, so o3 never pollutes the CLI's config with empty contexts.

## 6. Field mapping (shared vs UI-only)

| Design context field | Storage |
|---|---|
| `name` | context `name` (also o3's stable id) |
| `url` | `server` |
| `org` | `org` |
| `auth` (`password`/`token`) | `auth.scheme` (`basic`/`token`) |
| `email` | `auth.username` |
| `password` / `token` | keychain, key `AccountKey(url, scheme)` |
| `color`, `selfSigned`, `id` | UI-only — not persisted |

`auth: 'password'` ↔ scheme `basic`; `auth: 'token'` ↔ scheme `token`.

## 7. Frontend (from the updated `design/Observe.dc.html`)

Three surfaces wired to the bound methods, matching the committed design pixel/label:
- **Title-bar switcher** — active context (color dot + name) → dropdown of all contexts
  (`useContext` → `SwitchContext`); "+ Add context"; "Manage…" (opens Settings →
  Connection).
- **Settings → Connection "Contexts" manager** — add / list / use / delete (min 1) +
  "Edit active context" form (name, url, org, auth, email, secret) → `SaveContext`.
- **Setup wizard** — "Your contexts" list + "+ New context" + per-context name field;
  auto-opens only when there are zero usable contexts.

`App.tsx` holds `contexts: ContextInfo[]` + `currentName`; colors are assigned from a
palette by index. Switching a context calls `SwitchContext`, then re-runs `ListStreams`
and clears results. Adding holds a draft context in state until `SaveContext` persists it.

## 8. Error handling

Unchanged from M2: `apperr.Wrap` maps errors to `{category, message, hint}` and
`apperr.AppError.Error()` emits JSON that the frontend `parseAppError` unpacks. A
`not_configured` category (no contexts / no current client) opens the wizard.

## 9. Testing

- **`pkg/config` (CLI):** table-driven round-trip tests — read/write, upsert-by-name,
  set-current, remove (min 1 enforced), missing-file → empty, **missing `defaults:`
  tolerated**. Existing CLI tests stay green after the extraction.
- **o3:** `query`/`map`/`apperr` unchanged. The context bound methods + the three UI
  surfaces are build-gated (`go build ./...`, `wails build`) and verified manually
  against the live instance (the user's real `config.yaml` with `default` + `test`).

## 10. Risks / notes

- `go.work` referencing the sibling means `go work sync` / careless `go mod tidy` can
  dirty the CLI repo — avoid (verify the sibling is clean after Go commands).
- The extraction must not break CLI tests — run them after the move.
- The shared file is co-written by two tools; both go through `pkg/config.WriteFile`
  (whole-file rewrite), so the last writer wins. Acceptable for a single-user desktop +
  CLI; no file locking in this slice.
- Removing a context deletes its keychain secret; the CLI would then lose it too (shared)
  — intended.
