# o3 — OpenObserve Desktop · M2 Live Data (First Vertical Slice) — Design Spec

Date: 2026-06-26
Status: Approved (brainstorming) — pending written-spec review
Scope: M2 first slice — make the Logs explorer run on a real OpenObserve instance

## 1. Goal & non-goals

Replace the static mock data in the Logs explorer with live queries against a real
self-hosted OpenObserve instance, by reusing the existing Go client from the
`openobserve-cli` project. After this slice, the core loop works end-to-end:
**connect → pick a stream → run a SQL search → see real results (table + drawer),
real fields, a real histogram, over the selected time range**, with proper
loading/empty/error states.

The defining constraint (unchanged from M1): **reuse the CLI's client/auth — do not
reimplement query or auth logic** so the GUI and CLI cannot diverge.

### Non-goals (this slice — explicitly deferred to later M2 slices)
- Persistent query history (the history dropdown stays UI-only/mock).
- Schema-driven / live autocomplete (autocomplete stays static).
- Traces and metrics nav destinations (remain placeholders).
- Streaming "tail" / live-follow.
- A visual query builder — SQL is sent as the user types it; the editor stays a plain
  SQL textarea.
- Per-stream configurable column mapping (heuristic mapping only — see §6).

## 2. Decisions (from brainstorming)

- **First slice = core vertical** (connect + search → results + fields + histogram + time range).
- **Auth reuse = extract `pkg/auth` in the CLI** (the only cross-repo change).
- **Credential storage = OS keychain** (via `zalando/go-keyring`, the lib the CLI uses)
  for the secret; URL/org/scheme in a small JSON config in the app data dir.
- **Hit→row mapping = heuristic field detection**, done in Go.

## 3. Cross-repo change: `openobserve-cli` → new public `pkg/auth`

Move the pure credential→`Authorization`-header logic out of `internal/auth` into a new
public package so the GUI can build an authenticated client identically to the CLI.

`pkg/auth` (new, public):
```go
package auth

type Scheme string
const (
    SchemeBasic Scheme = "basic"  // email:password, base64 Basic
    SchemeToken Scheme = "token"  // pre-generated token, passed verbatim
)

type Credential struct {
    Scheme   Scheme
    Username string // email, for SchemeBasic
    Secret   string // password or token
}

func (c Credential) Header() string                 // existing logic, verbatim
func (c Credential) Decorator() transport.Decorator // existing logic, verbatim
func (c Credential) Validate() error                // internal consistency
```
- The pure header/decorator/validate logic (currently `internal/auth/inject.go` +
  `credential.go`'s `Credential`/`Scheme`/`Validate`) moves here. It depends only on
  `pkg/transport` — no config/keychain coupling.
- **CLI stays working:** `internal/auth` keeps its config/keychain-coupled parts
  (`resolver.go`, `keychain.go`, store) and either re-exports the moved types
  (`type Credential = auth.Credential`) or references `pkg/auth` directly. All existing
  CLI tests must still pass after the move.
- This is a mechanical extraction in a repo we own (`github.com/angelmsger/openobserve-cli`).

## 4. `o3` module wiring

- `go.mod`: add `require github.com/angelmsger/openobserve-cli <version>`.
- `go.work` (already present) `use`s `.` and `../oa-cli/src/openobserve-cli`, so the
  require resolves to the local sibling during dev.
- **Do not run `go work sync`** (it mutates the sibling's go.mod/go.sum); rely on
  `go build`/`wails build` with the workspace. If `go mod tidy` is needed, run it in a
  way that does not write to the sibling module.
- Imports used by the GUI:
  ```go
  api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
  "github.com/angelmsger/openobserve-cli/pkg/auth"
  "github.com/angelmsger/openobserve-cli/pkg/transport"
  cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
  ```

## 5. Go backend (`o3`) — files & responsibilities

```
o3/
├─ app.go                 App struct: holds *config + built apiclient.Client; bound methods
├─ internal/
│  ├─ config/config.go    load/save JSON config (url, org, scheme, username) in app data dir
│  ├─ config/secret.go    keychain get/set/delete (go-keyring), keyed by url+org
│  ├─ query/build.go      time-range→micros, SQL/paging, histogram-SQL construction
│  ├─ query/build_test.go table-driven tests (pure)
│  ├─ query/map.go        hit map[string]any → LogRow; SearchResponse → SearchResult
│  ├─ query/map_test.go   table-driven tests (pure)
│  └─ apperr/apperr.go    pkg/errors → {category, message, hint} for the frontend
```
The Go side stays thin: config/secret persistence, a small query-orchestration package
(`query`), error formatting, and the bound methods on `App`. All HTTP/auth is the
shared client.

### Bound methods (Wails generates the TS in `frontend/wailsjs/`)
```go
type ConnConfig struct { URL, Org, Scheme, Username string; Secret string } // Secret only inbound
type ConnInfo   struct { Version string; OrgCount, StreamCount int }
type StreamInfo struct { Name, StreamType string; Docs int64; Size string }
type Field      struct { Name, Type string }
type LogRow     struct { ID, Time, Level, Service, Body string; JSON []KV }
type KV         struct { K, V, Kind string } // kind: str|num|lvl
type Bucket     struct { T string; H float64 } // normalized 0..1 for the bar
type QueryMeta  struct { Total int64; TookMs int; ScanBytes float64 }
type SearchResult struct { Meta QueryMeta; Rows []LogRow; Histogram []Bucket }
type SearchParams struct {
    Stream     string
    SQL        string
    StartMicros, EndMicros int64
    From, Size int
    Histogram  bool
    Interval   string // e.g. "30s"
}

func (a *App) TestConnection(c ConnConfig) (ConnInfo, error)
func (a *App) SaveConnection(c ConnConfig) error           // writes config + keychain, rebuilds client
func (a *App) LoadConnection() (ConnConfig, error)         // Secret omitted; HasSecret implied by keychain
func (a *App) ListStreams() ([]StreamInfo, error)
func (a *App) GetFields(stream string) ([]Field, error)
func (a *App) RunQuery(p SearchParams) (SearchResult, error)
```
- `RunQuery` builds the request via `query.Build`, calls `client.Search`; if
  `p.Histogram`, runs the histogram search and normalizes buckets; maps hits via
  `query.Map`. Errors are wrapped through `apperr`.
- The client is built lazily/rebuilt on `SaveConnection`; if no credential is
  configured, data methods return a typed `not-configured` error the UI treats as
  "open the setup wizard".

## 6. Heuristic hit→row mapping (`query/map.go`)

`SearchResponse.Hits` are `[]map[string]any`. For each hit:
- **time** ← `_timestamp` (micros or RFC3339) → formatted `YYYY-MM-DD HH:mm:ss.SSS`.
- **level** ← first present of `level`, `severity`, `log_level`, `severitytext`
  (lowercased to info/warn/error/debug/trace; unknown → as-is).
- **service** ← first present of `service_name`, `service`, `k8s_container_name`.
- **body** ← first present of `body`, `message`, `msg`, `log`.
- **json** ← all keys in the hit, each typed `num` (JSON number), `str` (otherwise),
  and the level key marked `lvl` so the drawer colors it (matches M1's `kind: 'lvl'`).
- **id** ← stable per row (`_timestamp` + index).
Missing fields render blank (no crash). The same level→color and kind→color logic the
frontend already uses applies unchanged.

## 7. Time range → microseconds (`query/build.go`)

The UI time model (relative amount+unit, or absolute from/to) converts to
`[StartMicros, EndMicros]` epoch microseconds (OpenObserve's unit):
- relative: `end = now`, `start = now − amount·unit`.
- absolute: parse `from`/`to` (`YYYY-MM-DD HH:mm:ss`, local tz) → micros.
The histogram interval is derived from the span (default `30s`, matching the design)
and used in `histogram(_timestamp, '<interval>')`. Pure + table-tested.

## 8. Frontend wiring & states

- `App.tsx` calls the bindings (`frontend/wailsjs/go/main/App`); `mock.ts` becomes a
  fallback/demo only. New top-level state: `connection`, `loading`, `error`,
  `rows`/`meta`/`histogram`.
- **Startup:** `LoadConnection()`; if unconfigured, the **setup wizard auto-opens**
  (M1 left it manual) and `TestConnection`/`SaveConnection` back its buttons.
- **Run button** → `RunQuery` (uses the existing `running` spinner); **stream selector**
  → `ListStreams` + `GetFields`; **time picker** feeds `Start/EndMicros`.
- States: loading → spinner/skeleton in the results area; empty → "no results" message;
  error → banner (connection errors in the Connection panel; query errors above the
  results). The histogram/results/drawer render live data; existing visuals unchanged.

## 9. Error handling

`pkg/errors` categories + hints → `apperr` formats `{category, message, hint}`; Wails
surfaces a rejected promise carrying that. The UI maps category to placement
(connection vs query) and shows message + hint. Never swallow errors.

## 10. Testing

- **Go unit tests (pure, table-driven):** `query/map.go` (hit→LogRow across field
  variants, missing fields, number/string/level typing) and `query/build.go`
  (relative/absolute time → micros, interval selection, paging).
- **`pkg/auth` (CLI):** keep/move existing header tests; verify Basic and token schemes.
- **Live API calls:** verified manually against the user's real instance (need a live
  server). `wails build` + `go build ./...` must stay green.
- No frontend DOM tests (consistent with M1); frontend verified by running against the
  live instance.

## 11. Risks / notes

- `go.work` referencing the sibling means `go work sync`/careless `go mod tidy` can dirty
  the CLI repo — avoid (see §4).
- Field heuristics won't fit every stream; per-stream mapping is a deferred follow-up.
- Keychain access may prompt the OS on first use; that's expected.
- The CLI `pkg/auth` extraction must not break CLI tests — run them after the move.
