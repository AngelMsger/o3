# OpenObserve Desktop — M2 Live Data (First Vertical Slice) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Logs explorer's mock data with live queries against a real OpenObserve instance by reusing the existing Go client from `openobserve-cli`.

**Architecture:** Extract the CLI's pure credential logic into a new public `pkg/auth`, then add a thin Go layer in `o3` (config + keychain persistence, a pure `query` package for time→micros / histogram SQL / hit→row mapping, error formatting) exposing six Wails-bound methods. The React frontend swaps mock arrays for binding calls and gains loading/empty/error states. All HTTP/auth is the shared client — the GUI and CLI cannot diverge.

**Tech Stack:** Go 1.24, Wails v2, React 18 + TypeScript + Vite, `github.com/angelmsger/openobserve-cli` (sibling module via `go.work`), `github.com/zalando/go-keyring`.

## Global Constraints

- **Reuse, do not reimplement:** all auth and HTTP goes through `openobserve-cli`'s `pkg/auth`, `pkg/apiclient`, `pkg/transport`, `pkg/errors`. No query/auth logic is duplicated in `o3`.
- **Never run `go work sync`** (it rewrites the sibling CLI module's `go.mod`/`go.sum`). After any Go command that touches modules, verify the sibling is clean: `git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain` must print nothing.
- **Time unit everywhere is Unix microseconds** (`SearchQuery.StartTime`/`EndTime` are `int64` micros).
- **Histogram interval uses OpenObserve word-form** (`'30 second'`, `'5 minute'`, `'1 hour'`, `'1 day'`) inside `histogram(_timestamp, '<interval>')` — matching the CLI's `buildHistogramSQL`.
- **Go JSON tags must exactly match the frontend `types.ts` field names** (`id`, `time`, `level`, `service`, `body`, `ltype`, `trace`, `json`; KV `k`/`v`/`kind`) so binding results are structurally compatible with the existing TS types and the frontend keeps its own `types.ts`.
- **Secrets live in the OS keychain** (via `go-keyring`, service name `"openobserve-cli"`, account key `host:scheme`), never in the JSON config file.
- **Punctuation/term rules** (from user global config) apply to all Go comments, commit messages, and docs: ASCII half-width punctuation with a trailing space; PascalCase brand/tech terms in prose.
- **CLI cross-repo edits** happen in `/Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli` (module `github.com/angelmsger/openobserve-cli`), a repo we own.

---

## File Structure

**CLI repo (`oa-cli/src/openobserve-cli`) — Task 1 only:**
- Create `pkg/auth/credential.go` — `Credential`, `Scheme*` consts, `Validate`, `Redacted`, `maskSecret`, `AccountKey` (moved from `internal/auth`).
- Create `pkg/auth/inject.go` — `Header`, `hasAuthPrefix`, `Decorator` (moved from `internal/auth`).
- Create `pkg/auth/auth_test.go` — table-driven tests for `Header`/`Validate`/`AccountKey`.
- Replace `internal/auth/credential.go` — alias shim re-exporting the moved symbols.
- Delete `internal/auth/inject.go` — its methods now come with the aliased type.
- `internal/auth/resolver.go`, `internal/auth/keychain.go` — unchanged (config/keychain-coupled).

**o3 repo — Tasks 2-8:**
- `go.mod` — add the CLI require.
- `internal/apperr/apperr.go` (+ `apperr_test.go`) — `pkg/errors` → `{Category, Message, Hint}`.
- `internal/config/paths.go` — app data dir resolution.
- `internal/config/config.go` (+ `config_test.go`) — JSON config load/save.
- `internal/config/secret.go` — keychain get/set/delete.
- `internal/query/types.go` — wire DTOs produced by the query layer (`LogRow`, `KV`, `Bucket`, `QueryMeta`, `SearchResult`, `SearchParams`).
- `internal/query/build.go` (+ `build_test.go`) — time→micros, interval, histogram SQL.
- `internal/query/map.go` (+ `map_test.go`) — hit→`LogRow`, response→`SearchResult`, histogram hits→buckets.
- `app.go` — `App` struct fields, connection types (`ConnConfig`, `ConnInfo`, `StreamInfo`, `Field`), six bound methods.
- `frontend/wailsjs/go/...` — regenerated bindings (build artifact).
- `frontend/src/App.tsx` — binding calls, new state, loading/empty/error, auto-open wizard.
- `frontend/src/components/Histogram.tsx` — accept live `bars` prop.

---

## Conventions for every task

- Go tests run from the o3 root with the workspace active: `go test ./internal/...`.
- The CLI's time unit is microseconds; the CLI's histogram interval is word-form.
- After any module-touching Go command, run the sibling-clean check from Global Constraints.

---

### Task 1: Extract `pkg/auth` in the CLI repo

**Files (all under `/Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli`):**
- Create: `pkg/auth/credential.go`
- Create: `pkg/auth/inject.go`
- Create: `pkg/auth/auth_test.go`
- Modify (replace contents): `internal/auth/credential.go`
- Delete: `internal/auth/inject.go`

**Interfaces:**
- Consumes: `pkg/transport` (`transport.Decorator`), `pkg/errors` (`cerrors`).
- Produces (now importable as `github.com/angelmsger/openobserve-cli/pkg/auth`):
  - `const SchemeBasic = "basic"`, `const SchemeToken = "token"`
  - `type Credential struct { Scheme, Username, Secret string }`
  - `func (c Credential) Validate() error`
  - `func (c Credential) Redacted() Credential`
  - `func (c Credential) Header() string`
  - `func (c Credential) Decorator() transport.Decorator`
  - `func AccountKey(baseURL, scheme string) string`

- [ ] **Step 1: Create `pkg/auth/credential.go`** (moved verbatim from `internal/auth/credential.go`, package name stays `auth`)

```go
// Package auth models OpenObserve credentials and applies them to outgoing
// HTTP requests. It is the pure, dependency-light core shared by the CLI and
// the desktop GUI; configuration and keychain wiring live in their callers.
package auth

import (
	"net/url"
	"strings"

	cerrors "github.com/angelmsger/openobserve-cli/pkg/errors"
)

// Scheme identifies an authentication scheme.
const (
	// SchemeBasic is HTTP Basic auth: email (username) + password.
	SchemeBasic = "basic"
	// SchemeToken is a pre-generated credential sent verbatim in the
	// Authorization header (the base64 portion of a Basic token, or a full
	// "Basic …" / "Bearer …" value).
	SchemeToken = "token"
)

// Credential is a fully resolved credential ready to authenticate requests.
type Credential struct {
	Scheme   string
	Username string // basic only (the account email)
	Secret   string // password (basic) or token value (token)
}

// Validate reports whether the credential is internally consistent.
func (c Credential) Validate() error {
	switch c.Scheme {
	case SchemeToken:
		if c.Secret == "" {
			return cerrors.New(cerrors.CategoryConfig, "AUTH_NO_TOKEN",
				"no token configured")
		}
	case SchemeBasic:
		if c.Username == "" || c.Secret == "" {
			return cerrors.New(cerrors.CategoryConfig, "AUTH_NO_BASIC",
				"basic auth requires both an email and a password")
		}
	default:
		return cerrors.Newf(cerrors.CategoryConfig, "AUTH_BAD_SCHEME",
			"unknown auth scheme %q (want basic or token)", c.Scheme)
	}
	return nil
}

// Redacted returns a copy safe for logging: the secret is masked.
func (c Credential) Redacted() Credential {
	c.Secret = maskSecret(c.Secret)
	return c
}

func maskSecret(s string) string {
	if s == "" {
		return ""
	}
	if len(s) <= 4 {
		return "****"
	}
	return strings.Repeat("*", len(s)-4) + s[len(s)-4:]
}

// AccountKey derives the keychain account identifier for a base URL and scheme.
// It is stable across runs so credentials can be located later.
func AccountKey(baseURL, scheme string) string {
	host := baseURL
	if u, err := url.Parse(baseURL); err == nil && u.Host != "" {
		host = u.Host
	}
	return host + ":" + scheme
}
```

- [ ] **Step 2: Create `pkg/auth/inject.go`** (moved verbatim from `internal/auth/inject.go`)

```go
package auth

import (
	"encoding/base64"
	"net/http"
	"strings"

	"github.com/angelmsger/openobserve-cli/pkg/transport"
)

// Header returns the Authorization header value for the credential.
//
// OpenObserve authenticates API requests with HTTP Basic auth. For the basic
// scheme we encode email:password; for the token scheme the user supplies a
// pre-generated credential — either the already-base64-encoded basic token, or
// a full "Basic …" / "Bearer …" header value, which we pass through verbatim.
func (c Credential) Header() string {
	switch c.Scheme {
	case SchemeBasic:
		raw := c.Username + ":" + c.Secret
		return "Basic " + base64.StdEncoding.EncodeToString([]byte(raw))
	case SchemeToken:
		s := strings.TrimSpace(c.Secret)
		if hasAuthPrefix(s) {
			return s
		}
		return "Basic " + s
	default:
		return ""
	}
}

func hasAuthPrefix(s string) bool {
	lower := strings.ToLower(s)
	return strings.HasPrefix(lower, "basic ") || strings.HasPrefix(lower, "bearer ")
}

// Decorator returns a transport.Decorator that authenticates every request.
func (c Credential) Decorator() transport.Decorator {
	header := c.Header()
	return func(req *http.Request) {
		if header != "" {
			req.Header.Set("Authorization", header)
		}
	}
}
```

- [ ] **Step 3: Replace `internal/auth/credential.go` with an alias shim**

Replace the ENTIRE contents of `internal/auth/credential.go` with:

```go
// Package auth resolves OpenObserve credentials from configuration or secure
// storage. The pure credential model (header construction, validation, account
// keying) lives in the public pkg/auth; this package keeps the
// config/keychain-coupled resolution and re-exports the moved symbols so
// existing callers keep working unchanged.
package auth

import (
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
)

// Credential is re-exported from pkg/auth. Its methods (Header, Decorator,
// Validate, Redacted) come with the aliased type.
type Credential = pkgauth.Credential

// Auth scheme identifiers, re-exported from pkg/auth.
const (
	SchemeBasic = pkgauth.SchemeBasic
	SchemeToken = pkgauth.SchemeToken
)

// AccountKey is re-exported from pkg/auth.
func AccountKey(baseURL, scheme string) string {
	return pkgauth.AccountKey(baseURL, scheme)
}
```

- [ ] **Step 4: Delete `internal/auth/inject.go`**

```bash
cd /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli
rm internal/auth/inject.go
```

The `Header`/`Decorator` methods now live on `pkgauth.Credential`; because `internal/auth.Credential` is a type alias, `cred.Decorator()` in `resolver.go` and `context.go` still resolves.

- [ ] **Step 5: Create `pkg/auth/auth_test.go`** (new — the moved code had no tests, and the package is now public)

```go
package auth

import (
	"encoding/base64"
	"net/http"
	"testing"
)

func TestHeader(t *testing.T) {
	tests := []struct {
		name string
		cred Credential
		want string
	}{
		{
			name: "basic encodes email:password",
			cred: Credential{Scheme: SchemeBasic, Username: "ops@x.com", Secret: "pw"},
			want: "Basic " + base64.StdEncoding.EncodeToString([]byte("ops@x.com:pw")),
		},
		{
			name: "token without prefix gets Basic",
			cred: Credential{Scheme: SchemeToken, Secret: "abc123"},
			want: "Basic abc123",
		},
		{
			name: "token with Basic prefix passes through",
			cred: Credential{Scheme: SchemeToken, Secret: "Basic abc123"},
			want: "Basic abc123",
		},
		{
			name: "token with Bearer prefix passes through",
			cred: Credential{Scheme: SchemeToken, Secret: "Bearer xyz"},
			want: "Bearer xyz",
		},
		{
			name: "unknown scheme yields empty",
			cred: Credential{Scheme: "nope", Secret: "x"},
			want: "",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.cred.Header(); got != tt.want {
				t.Fatalf("Header() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		cred    Credential
		wantErr bool
	}{
		{"basic ok", Credential{Scheme: SchemeBasic, Username: "u", Secret: "p"}, false},
		{"basic missing secret", Credential{Scheme: SchemeBasic, Username: "u"}, true},
		{"token ok", Credential{Scheme: SchemeToken, Secret: "t"}, false},
		{"token missing secret", Credential{Scheme: SchemeToken}, true},
		{"unknown scheme", Credential{Scheme: "x", Secret: "t"}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cred.Validate()
			if (err != nil) != tt.wantErr {
				t.Fatalf("Validate() err = %v, wantErr = %v", err, tt.wantErr)
			}
		})
	}
}

func TestDecoratorSetsAuthorization(t *testing.T) {
	cred := Credential{Scheme: SchemeToken, Secret: "Bearer tok"}
	req, _ := http.NewRequest(http.MethodGet, "http://x", nil)
	cred.Decorator()(req)
	if got := req.Header.Get("Authorization"); got != "Bearer tok" {
		t.Fatalf("Authorization = %q, want %q", got, "Bearer tok")
	}
}

func TestAccountKey(t *testing.T) {
	tests := []struct {
		baseURL, scheme, want string
	}{
		{"http://localhost:5080", "basic", "localhost:5080:basic"},
		{"https://api.openobserve.ai", "token", "api.openobserve.ai:token"},
		{"not-a-url", "basic", "not-a-url:basic"},
	}
	for _, tt := range tests {
		if got := AccountKey(tt.baseURL, tt.scheme); got != tt.want {
			t.Fatalf("AccountKey(%q,%q) = %q, want %q", tt.baseURL, tt.scheme, got, tt.want)
		}
	}
}
```

- [ ] **Step 6: Build and test the CLI (must stay green)**

```bash
cd /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli
go build ./... && go test ./...
```
Expected: build succeeds; all tests PASS (including the new `pkg/auth` tests and the existing `pkg/apiclient` tests). No import cycle.

- [ ] **Step 7: Commit (in the CLI repo)**

```bash
cd /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli
git add pkg/auth/credential.go pkg/auth/inject.go pkg/auth/auth_test.go internal/auth/credential.go
git add -A internal/auth/inject.go
git commit -m "refactor: extract pure credential logic into public pkg/auth

Move Credential, Header, Decorator, Validate, AccountKey from internal/auth
into a new public pkg/auth so the desktop GUI can build an authenticated
client identically to the CLI. internal/auth re-exports via type alias; the
config/keychain-coupled resolver and store stay internal.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire o3 to the CLI module + add `internal/apperr`

This task proves the cross-module import compiles and delivers the error-formatting package that later tasks reuse.

**Files (o3 repo):**
- Modify: `/Users/angelmsger/Development/Workspaces/o3/go.mod`
- Create: `/Users/angelmsger/Development/Workspaces/o3/internal/apperr/apperr.go`
- Create: `/Users/angelmsger/Development/Workspaces/o3/internal/apperr/apperr_test.go`

**Interfaces:**
- Consumes: `cerr "github.com/angelmsger/openobserve-cli/pkg/errors"` (`cerr.AsCLIError`, `cerr.CLIError` fields `Category`/`Message`/`Hint`, `cerr.Category` constants).
- Produces:
  - `type AppError struct { Category string \`json:"category"\`; Message string \`json:"message"\`; Hint string \`json:"hint"\` }`
  - `func (e AppError) Error() string`
  - `func Wrap(err error) error` — converts any error to an `AppError` (returns `nil` for `nil`).
  - `const CategoryNotConfigured = "not_configured"`
  - `func NotConfigured(msg string) error`

- [ ] **Step 1: Add the CLI require to `go.mod`**

Add this line to the first `require` block of `/Users/angelmsger/Development/Workspaces/o3/go.mod` (just after the wails require):

```
require github.com/angelmsger/openobserve-cli v0.0.0-00010101000000-000000000000
```

(The version is a placeholder; `go.work` resolves the import to the local sibling. Do not publish or fetch it.)

- [ ] **Step 2: Write the failing test `internal/apperr/apperr_test.go`**

```go
package apperr

import (
	"errors"
	"testing"

	cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
)

func TestWrapClassifiesCLIError(t *testing.T) {
	src := cerr.New(cerr.CategoryAuth, "BAD", "bad creds").WithHint("check password")
	wrapped := Wrap(src)
	var ae AppError
	if !errors.As(wrapped, &ae) {
		t.Fatalf("Wrap did not produce an AppError: %T", wrapped)
	}
	if ae.Category != "auth" {
		t.Fatalf("Category = %q, want %q", ae.Category, "auth")
	}
	if ae.Message != "bad creds" {
		t.Fatalf("Message = %q, want %q", ae.Message, "bad creds")
	}
	if ae.Hint != "check password" {
		t.Fatalf("Hint = %q, want %q", ae.Hint, "check password")
	}
}

func TestWrapPlainError(t *testing.T) {
	wrapped := Wrap(errors.New("boom"))
	var ae AppError
	if !errors.As(wrapped, &ae) {
		t.Fatalf("Wrap did not produce an AppError: %T", wrapped)
	}
	if ae.Message != "boom" {
		t.Fatalf("Message = %q, want %q", ae.Message, "boom")
	}
}

func TestWrapNil(t *testing.T) {
	if Wrap(nil) != nil {
		t.Fatal("Wrap(nil) should be nil")
	}
}

func TestNotConfigured(t *testing.T) {
	var ae AppError
	if !errors.As(NotConfigured("set up first"), &ae) {
		t.Fatal("NotConfigured should be an AppError")
	}
	if ae.Category != CategoryNotConfigured {
		t.Fatalf("Category = %q, want %q", ae.Category, CategoryNotConfigured)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails (compile error / undefined)**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/apperr/
```
Expected: FAIL — `undefined: AppError`, `undefined: Wrap`, etc. (If it instead fails to resolve the CLI import, fix module wiring per Step 5 first, then return here.)

- [ ] **Step 4: Write `internal/apperr/apperr.go`**

```go
// Package apperr converts the CLI client's rich errors into a small, JSON-safe
// shape the frontend can place (connection vs query) and display.
package apperr

import (
	cerr "github.com/angelmsger/openobserve-cli/pkg/errors"
)

// CategoryNotConfigured marks the "no connection configured yet" state, which
// the UI treats as "open the setup wizard".
const CategoryNotConfigured = "not_configured"

// AppError is the JSON-encodable error surfaced across the Wails boundary.
type AppError struct {
	Category string `json:"category"`
	Message  string `json:"message"`
	Hint     string `json:"hint"`
}

func (e AppError) Error() string { return e.Message }

// Wrap converts any error into an AppError. CLIErrors keep their category and
// hint; plain errors become an "internal" AppError with the error text.
func Wrap(err error) error {
	if err == nil {
		return nil
	}
	if ae, ok := err.(AppError); ok {
		return ae
	}
	ce := cerr.AsCLIError(err)
	return AppError{
		Category: string(ce.Category),
		Message:  ce.Message,
		Hint:     ce.Hint,
	}
}

// NotConfigured builds an AppError the UI maps to the setup wizard.
func NotConfigured(msg string) error {
	return AppError{Category: CategoryNotConfigured, Message: msg}
}
```

Note: `cerr.AsCLIError` (confirmed present in `pkg/errors/codes.go`) returns a `*CLIError` for any error, classifying unknown errors as `CategoryInternal` and copying the message. If a build error reports `AsCLIError` missing, fall back to a type assertion on `*cerr.CLIError` with a default `{Category:"internal", Message: err.Error()}`.

- [ ] **Step 5: Build the whole module + verify cross-module wiring**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go build ./...
```
Expected: builds. If it reports missing `go.sum` entries for `github.com/zalando/go-keyring` or its transitive deps, run the exact `go mod download <module>@<version>` command Go prints (these write only o3's `go.sum`/`go.work.sum`). Do NOT run `go work sync` or `go mod tidy`.

- [ ] **Step 6: Verify the sibling CLI repo is untouched**

```bash
git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain
```
Expected: empty output. If anything appears, revert it (`git -C … checkout -- go.mod go.sum`) and investigate before continuing.

- [ ] **Step 7: Run the test to verify it passes**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/apperr/
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add go.mod go.sum go.work.sum internal/apperr/
git commit -m "feat: wire o3 to openobserve-cli module and add apperr

Add the CLI module require (resolved locally via go.work) and an apperr
package that converts pkg/errors CLIErrors into a JSON-safe {category,
message, hint} for the frontend.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Connection config persistence (`internal/config`)

**Files (o3 repo):**
- Create: `internal/config/paths.go`
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`

**Interfaces:**
- Consumes: stdlib only.
- Produces:
  - `type Config struct { URL string \`json:"url"\`; Org string \`json:"org"\`; Scheme string \`json:"scheme"\`; Username string \`json:"username"\` }`
  - `func DataDir() (string, error)` — `~/.angelmsger/openobserve-desktop`.
  - `func Load(dir string) (Config, error)` — returns zero `Config` (no error) when the file is absent.
  - `func Save(dir string, c Config) error` — writes `dir/config.json` (0600), creating `dir` (0700).

- [ ] **Step 1: Write `internal/config/paths.go`**

```go
// Package config persists the desktop app's connection settings (non-secret)
// as JSON in the user's app data directory. Secrets live in the keychain
// (see secret.go).
package config

import (
	"os"
	"path/filepath"
)

// DataDir returns the per-user app data directory for the desktop app,
// ~/.angelmsger/openobserve-desktop, sharing the ~/.angelmsger parent the CLI
// family uses.
func DataDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".angelmsger", "openobserve-desktop"), nil
}
```

- [ ] **Step 2: Write the failing test `internal/config/config_test.go`**

```go
package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadMissingReturnsZero(t *testing.T) {
	dir := t.TempDir()
	c, err := Load(dir)
	if err != nil {
		t.Fatalf("Load on missing file: %v", err)
	}
	if (c != Config{}) {
		t.Fatalf("expected zero Config, got %+v", c)
	}
}

func TestSaveThenLoadRoundTrips(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "nested")
	in := Config{URL: "http://localhost:5080", Org: "default", Scheme: "basic", Username: "ops@x.com"}
	if err := Save(dir, in); err != nil {
		t.Fatalf("Save: %v", err)
	}
	out, err := Load(dir)
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if out != in {
		t.Fatalf("round-trip mismatch: got %+v want %+v", out, in)
	}
}

func TestSaveFilePermissions(t *testing.T) {
	dir := t.TempDir()
	if err := Save(dir, Config{URL: "x"}); err != nil {
		t.Fatalf("Save: %v", err)
	}
	info, err := os.Stat(filepath.Join(dir, "config.json"))
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("perm = %o, want 600", perm)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/config/
```
Expected: FAIL — `undefined: Load`, `undefined: Save`, `undefined: Config`.

- [ ] **Step 4: Write `internal/config/config.go`**

```go
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// configFileName is the JSON file holding non-secret connection settings.
const configFileName = "config.json"

// Config holds the non-secret connection settings. The secret (password or
// token) is stored separately in the OS keychain.
type Config struct {
	URL      string `json:"url"`
	Org      string `json:"org"`
	Scheme   string `json:"scheme"`
	Username string `json:"username"`
}

// Load reads the config from dir. A missing file yields a zero Config and no
// error (the app is simply unconfigured).
func Load(dir string) (Config, error) {
	raw, err := os.ReadFile(filepath.Join(dir, configFileName))
	if err != nil {
		if os.IsNotExist(err) {
			return Config{}, nil
		}
		return Config{}, err
	}
	var c Config
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &c); err != nil {
			return Config{}, err
		}
	}
	return c, nil
}

// Save writes c as JSON to dir/config.json, creating dir (0700) and the file
// (0600).
func Save(dir string, c Config) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	out, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, configFileName), out, 0o600)
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/config/
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/config/paths.go internal/config/config.go internal/config/config_test.go
git commit -m "feat: persist non-secret connection config as JSON

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Keychain secret storage (`internal/config/secret.go`)

**Files (o3 repo):**
- Create: `internal/config/secret.go`
- Create: `internal/config/secret_test.go`

**Interfaces:**
- Consumes: `github.com/zalando/go-keyring`, `pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"` (for `AccountKey`).
- Produces:
  - `const keychainService = "openobserve-cli"` (unexported; matches the CLI so a credential saved by either tool is found by the other).
  - `func SaveSecret(url, scheme, secret string) error`
  - `func LoadSecret(url, scheme string) (string, bool, error)` — `bool` is `false` (no error) when absent.
  - `func DeleteSecret(url, scheme string) error`

- [ ] **Step 1: Write the failing test `internal/config/secret_test.go`**

The keychain may be unavailable in CI/headless; the test self-skips if `SaveSecret` fails (matching the spec's "keychain verified manually"). The key-derivation reuse is what we assert deterministically.

```go
package config

import (
	"testing"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
)

func TestSecretAccountKeyMatchesCLI(t *testing.T) {
	// secretAccount must equal the CLI's AccountKey so a credential stored by
	// either tool resolves from the other.
	want := pkgauth.AccountKey("http://localhost:5080", "basic")
	if got := secretAccount("http://localhost:5080", "basic"); got != want {
		t.Fatalf("secretAccount = %q, want %q", got, want)
	}
}

func TestSecretRoundTrip(t *testing.T) {
	const url, scheme, secret = "http://keytest.local:5080", "token", "s3cr3t"
	if err := SaveSecret(url, scheme, secret); err != nil {
		t.Skipf("keychain unavailable in this environment: %v", err)
	}
	t.Cleanup(func() { _ = DeleteSecret(url, scheme) })

	got, ok, err := LoadSecret(url, scheme)
	if err != nil {
		t.Fatalf("LoadSecret: %v", err)
	}
	if !ok || got != secret {
		t.Fatalf("LoadSecret = (%q,%v), want (%q,true)", got, ok, secret)
	}

	if err := DeleteSecret(url, scheme); err != nil {
		t.Fatalf("DeleteSecret: %v", err)
	}
	if _, ok, _ := LoadSecret(url, scheme); ok {
		t.Fatal("secret still present after delete")
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/config/ -run Secret
```
Expected: FAIL — `undefined: secretAccount`, `undefined: SaveSecret`, etc.

- [ ] **Step 3: Write `internal/config/secret.go`**

```go
package config

import (
	"errors"

	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	"github.com/zalando/go-keyring"
)

// keychainService is the OS keychain service name. It matches the CLI's
// constants.KeychainService so a credential saved by either tool is found by
// the other.
const keychainService = "openobserve-cli"

// secretAccount derives the keychain account for a base URL and scheme,
// reusing the CLI's stable key format (host:scheme).
func secretAccount(url, scheme string) string {
	return pkgauth.AccountKey(url, scheme)
}

// SaveSecret stores the secret (password or token) for url+scheme in the OS
// keychain.
func SaveSecret(url, scheme, secret string) error {
	return keyring.Set(keychainService, secretAccount(url, scheme), secret)
}

// LoadSecret retrieves the secret for url+scheme. The bool is false (with no
// error) when no secret is stored.
func LoadSecret(url, scheme string) (string, bool, error) {
	secret, err := keyring.Get(keychainService, secretAccount(url, scheme))
	if err != nil {
		if errors.Is(err, keyring.ErrNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	return secret, true, nil
}

// DeleteSecret removes any stored secret for url+scheme. A missing entry is not
// an error.
func DeleteSecret(url, scheme string) error {
	err := keyring.Delete(keychainService, secretAccount(url, scheme))
	if err != nil && errors.Is(err, keyring.ErrNotFound) {
		return nil
	}
	return err
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/config/ -run Secret
```
Expected: `TestSecretAccountKeyMatchesCLI` PASSes; `TestSecretRoundTrip` PASSes (or SKIPs if the keychain is unavailable). On macOS dev it should PASS — the OS may prompt to allow keychain access; allow it.

- [ ] **Step 5: Verify the sibling repo is still clean, then commit**

```bash
git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain   # expect empty
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/config/secret.go internal/config/secret_test.go
git commit -m "feat: store connection secrets in the OS keychain

Reuse the CLI's account-key format and keychain service so credentials are
shared between the CLI and the desktop app.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Query building (`internal/query/build.go` + shared types)

**Files (o3 repo):**
- Create: `internal/query/types.go`
- Create: `internal/query/build.go`
- Create: `internal/query/build_test.go`

**Interfaces:**
- Consumes: stdlib only.
- Produces (in `internal/query`):
  - DTOs (used by Task 6 and Task 7):
    ```go
    type KV struct { K string `json:"k"`; V string `json:"v"`; Kind string `json:"kind"` }
    type LogRow struct {
        ID string `json:"id"`; Time string `json:"time"`; Level string `json:"level"`
        Service string `json:"service"`; Body string `json:"body"`; LType string `json:"ltype"`
        Trace string `json:"trace"`; JSON []KV `json:"json"`
    }
    type Bucket struct { T string `json:"t"`; H float64 `json:"h"` }
    type QueryMeta struct { Total int64 `json:"total"`; TookMs int `json:"tookMs"`; ScanBytes float64 `json:"scanBytes"` }
    type SearchResult struct { Meta QueryMeta `json:"meta"`; Rows []LogRow `json:"rows"`; Histogram []Bucket `json:"histogram"` }
    type SearchParams struct {
        Stream string `json:"stream"`; SQL string `json:"sql"`
        StartMicros int64 `json:"startMicros"`; EndMicros int64 `json:"endMicros"`
        From int `json:"from"`; Size int `json:"size"`; Histogram bool `json:"histogram"`
    }
    ```
  - Pure builders:
    - `func RelativeRange(now time.Time, amount int, unit string) (start, end int64, err error)`
    - `func AbsoluteRange(from, to string, loc *time.Location) (start, end int64, err error)`
    - `func Interval(startMicros, endMicros int64) string`
    - `func HistogramSQL(stream, interval string) string`

- [ ] **Step 1: Write `internal/query/types.go`**

```go
// Package query builds OpenObserve search requests (time ranges, intervals,
// histogram SQL) and maps raw hits into the frontend's row shape. It is pure:
// no HTTP, no client. The bound methods in package main supply the client.
package query

// KV is one key/value entry in a row's expanded JSON, typed for coloring.
// Kind is "str", "num", or "lvl".
type KV struct {
	K    string `json:"k"`
	V    string `json:"v"`
	Kind string `json:"kind"`
}

// LogRow mirrors the frontend's LogRow (types.ts) field-for-field.
type LogRow struct {
	ID      string `json:"id"`
	Time    string `json:"time"`
	Level   string `json:"level"`
	Service string `json:"service"`
	Body    string `json:"body"`
	LType   string `json:"ltype"`
	Trace   string `json:"trace"`
	JSON    []KV   `json:"json"`
}

// Bucket is one histogram column: T is the bucket label, H is the normalized
// height in [0,1].
type Bucket struct {
	T string  `json:"t"`
	H float64 `json:"h"`
}

// QueryMeta summarizes a search for the results header.
type QueryMeta struct {
	Total     int64   `json:"total"`
	TookMs    int     `json:"tookMs"`
	ScanBytes float64 `json:"scanBytes"`
}

// SearchResult is the full payload RunQuery returns to the frontend.
type SearchResult struct {
	Meta      QueryMeta `json:"meta"`
	Rows      []LogRow  `json:"rows"`
	Histogram []Bucket  `json:"histogram"`
}

// SearchParams is the frontend's RunQuery request.
type SearchParams struct {
	Stream      string `json:"stream"`
	SQL         string `json:"sql"`
	StartMicros int64  `json:"startMicros"`
	EndMicros   int64  `json:"endMicros"`
	From        int    `json:"from"`
	Size        int    `json:"size"`
	Histogram   bool   `json:"histogram"`
}
```

- [ ] **Step 2: Write the failing test `internal/query/build_test.go`**

```go
package query

import (
	"testing"
	"time"
)

func TestRelativeRange(t *testing.T) {
	now := time.Date(2026, 6, 26, 12, 0, 0, 0, time.UTC)
	tests := []struct {
		amount     int
		unit       string
		wantSpanUS int64
		wantErr    bool
	}{
		{15, "m", 15 * 60 * 1_000_000, false},
		{1, "h", 60 * 60 * 1_000_000, false},
		{30, "s", 30 * 1_000_000, false},
		{2, "d", 2 * 24 * 60 * 60 * 1_000_000, false},
		{1, "w", 7 * 24 * 60 * 60 * 1_000_000, false},
		{5, "x", 0, true},
		{0, "m", 0, true},
	}
	for _, tt := range tests {
		start, end, err := RelativeRange(now, tt.amount, tt.unit)
		if (err != nil) != tt.wantErr {
			t.Fatalf("amount=%d unit=%q err=%v wantErr=%v", tt.amount, tt.unit, err, tt.wantErr)
		}
		if tt.wantErr {
			continue
		}
		if end != now.UnixMicro() {
			t.Fatalf("end = %d, want now %d", end, now.UnixMicro())
		}
		if got := end - start; got != tt.wantSpanUS {
			t.Fatalf("span = %d, want %d", got, tt.wantSpanUS)
		}
	}
}

func TestAbsoluteRange(t *testing.T) {
	loc := time.UTC
	start, end, err := AbsoluteRange("2026-06-26 10:00:00", "2026-06-26 11:00:00", loc)
	if err != nil {
		t.Fatalf("AbsoluteRange: %v", err)
	}
	wantStart := time.Date(2026, 6, 26, 10, 0, 0, 0, loc).UnixMicro()
	wantEnd := time.Date(2026, 6, 26, 11, 0, 0, 0, loc).UnixMicro()
	if start != wantStart || end != wantEnd {
		t.Fatalf("got (%d,%d), want (%d,%d)", start, end, wantStart, wantEnd)
	}

	if _, _, err := AbsoluteRange("nope", "2026-06-26 11:00:00", loc); err == nil {
		t.Fatal("expected parse error for bad 'from'")
	}
	if _, _, err := AbsoluteRange("2026-06-26 11:00:00", "2026-06-26 10:00:00", loc); err == nil {
		t.Fatal("expected error when end is before start")
	}
}

func TestInterval(t *testing.T) {
	us := func(sec int64) (int64, int64) { return 0, sec * 1_000_000 }
	tests := []struct {
		spanSec int64
		want    string
	}{
		{15 * 60, "30 second"}, // 900s/60 = 15 -> ladder >=15 is 30
		{5 * 60, "5 second"},   // 300s/60 = 5
		{60 * 60, "1 minute"},  // 3600s/60 = 60
		{24 * 60 * 60, "30 minute"},
		{7 * 24 * 60 * 60, "6 hour"},
		{365 * 24 * 60 * 60, "1 day"}, // capped
	}
	for _, tt := range tests {
		s, e := us(tt.spanSec)
		if got := Interval(s, e); got != tt.want {
			t.Fatalf("Interval span=%ds = %q, want %q", tt.spanSec, got, tt.want)
		}
	}
}

func TestHistogramSQL(t *testing.T) {
	got := HistogramSQL("demo_logs", "30 second")
	want := `SELECT histogram(_timestamp, '30 second') AS zo_sql_key, count(*) AS zo_sql_num FROM "demo_logs" GROUP BY zo_sql_key ORDER BY zo_sql_key`
	if got != want {
		t.Fatalf("HistogramSQL =\n%q\nwant\n%q", got, want)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/query/
```
Expected: FAIL — `undefined: RelativeRange`, etc.

- [ ] **Step 4: Write `internal/query/build.go`**

```go
package query

import (
	"fmt"
	"time"
)

// RelativeRange returns [start,end] in epoch microseconds for "last amount·unit"
// ending at now. unit is one of s, m, h, d, w.
func RelativeRange(now time.Time, amount int, unit string) (start, end int64, err error) {
	if amount <= 0 {
		return 0, 0, fmt.Errorf("amount must be positive, got %d", amount)
	}
	var d time.Duration
	switch unit {
	case "s":
		d = time.Duration(amount) * time.Second
	case "m":
		d = time.Duration(amount) * time.Minute
	case "h":
		d = time.Duration(amount) * time.Hour
	case "d":
		d = time.Duration(amount) * 24 * time.Hour
	case "w":
		d = time.Duration(amount) * 7 * 24 * time.Hour
	default:
		return 0, 0, fmt.Errorf("unknown time unit %q (want s, m, h, d, w)", unit)
	}
	end = now.UnixMicro()
	start = now.Add(-d).UnixMicro()
	return start, end, nil
}

// absLayout is the wall-clock format the absolute time picker emits.
const absLayout = "2006-01-02 15:04:05"

// AbsoluteRange parses "YYYY-MM-DD HH:mm:ss" from/to in loc into epoch micros.
func AbsoluteRange(from, to string, loc *time.Location) (start, end int64, err error) {
	if loc == nil {
		loc = time.Local
	}
	f, err := time.ParseInLocation(absLayout, from, loc)
	if err != nil {
		return 0, 0, fmt.Errorf("bad start time %q: %w", from, err)
	}
	t, err := time.ParseInLocation(absLayout, to, loc)
	if err != nil {
		return 0, 0, fmt.Errorf("bad end time %q: %w", to, err)
	}
	start, end = f.UnixMicro(), t.UnixMicro()
	if end <= start {
		return 0, 0, fmt.Errorf("end time must be after start time")
	}
	return start, end, nil
}

// intervalLadder maps a bucket size in seconds to its OpenObserve word form,
// ordered ascending. Interval snaps a target up to the smallest ladder entry.
var intervalLadder = []struct {
	sec  int64
	word string
}{
	{1, "1 second"}, {5, "5 second"}, {10, "10 second"}, {30, "30 second"},
	{60, "1 minute"}, {300, "5 minute"}, {900, "15 minute"}, {1800, "30 minute"},
	{3600, "1 hour"}, {7200, "2 hour"}, {21600, "6 hour"}, {43200, "12 hour"},
	{86400, "1 day"},
}

// Interval picks a histogram bucket size for the span, aiming for ~60 buckets,
// snapped up to the nearest ladder entry and capped at one day.
func Interval(startMicros, endMicros int64) string {
	spanSec := (endMicros - startMicros) / 1_000_000
	if spanSec < 0 {
		spanSec = 0
	}
	target := spanSec / 60
	for _, e := range intervalLadder {
		if e.sec >= target {
			return e.word
		}
	}
	return intervalLadder[len(intervalLadder)-1].word
}

// HistogramSQL builds the time-bucket aggregation, matching the CLI's
// buildHistogramSQL shape (zo_sql_key / zo_sql_num columns).
func HistogramSQL(stream, interval string) string {
	return fmt.Sprintf(
		`SELECT histogram(_timestamp, '%s') AS zo_sql_key, count(*) AS zo_sql_num FROM "%s" GROUP BY zo_sql_key ORDER BY zo_sql_key`,
		interval, stream,
	)
}
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/query/
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/query/types.go internal/query/build.go internal/query/build_test.go
git commit -m "feat: pure query builders (time ranges, interval, histogram SQL)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Hit mapping (`internal/query/map.go`)

**Files (o3 repo):**
- Create: `internal/query/map.go`
- Create: `internal/query/map_test.go`

**Interfaces:**
- Consumes: the DTOs from Task 5 (`LogRow`, `KV`, `Bucket`); stdlib only (operates on `[]map[string]any`, not on apiclient types, so it stays pure and testable).
- Produces:
  - `func MapHits(hits []map[string]any) []LogRow`
  - `func MapHistogram(hits []map[string]any) []Bucket` — reads `zo_sql_key`/`zo_sql_num`, normalizes `H` to [0,1].

- [ ] **Step 1: Write the failing test `internal/query/map_test.go`**

```go
package query

import (
	"reflect"
	"testing"
)

func findKV(kvs []KV, key string) (KV, bool) {
	for _, kv := range kvs {
		if kv.K == key {
			return kv, true
		}
	}
	return KV{}, false
}

func TestMapHitsFieldDetection(t *testing.T) {
	hits := []map[string]any{
		{
			"_timestamp":        float64(1751337480530000),
			"severity":          "info",
			"service_name":      "dingtalk-corp",
			"body":              "corp:message",
			"metadata_log_type": "rabbitmq",
			"ctx_trace_id":      "00000000b093900ad9162fec",
			"dropped_count":     float64(0),
		},
	}
	rows := MapHits(hits)
	if len(rows) != 1 {
		t.Fatalf("want 1 row, got %d", len(rows))
	}
	r := rows[0]
	if r.ID != "0" {
		t.Fatalf("ID = %q, want 0", r.ID)
	}
	if r.Level != "info" {
		t.Fatalf("Level = %q, want info", r.Level)
	}
	if r.Service != "dingtalk-corp" {
		t.Fatalf("Service = %q, want dingtalk-corp", r.Service)
	}
	if r.Body != "corp:message" {
		t.Fatalf("Body = %q, want corp:message", r.Body)
	}
	if r.LType != "rabbitmq" {
		t.Fatalf("LType = %q, want rabbitmq", r.LType)
	}
	if r.Trace != "00000000b093900ad9162fec" {
		t.Fatalf("Trace = %q, want trace id", r.Trace)
	}
	if r.Time != "2026-06-25 13:58:00.530" && r.Time == "" {
		t.Fatalf("Time not formatted: %q", r.Time)
	}
}

func TestMapHitsKVTypingAndOrder(t *testing.T) {
	hits := []map[string]any{
		{
			"severity":      "warn",
			"count":         float64(42),
			"name":          "alpha",
			"_timestamp":    float64(1751337480530000),
		},
	}
	kvs := MapHits(hits)[0].JSON
	// keys are sorted alphabetically
	gotKeys := make([]string, len(kvs))
	for i, kv := range kvs {
		gotKeys[i] = kv.K
	}
	wantKeys := []string{"_timestamp", "count", "name", "severity"}
	if !reflect.DeepEqual(gotKeys, wantKeys) {
		t.Fatalf("keys = %v, want %v", gotKeys, wantKeys)
	}
	if kv, _ := findKV(kvs, "count"); kv.Kind != "num" || kv.V != "42" {
		t.Fatalf("count kv = %+v, want num/42", kv)
	}
	if kv, _ := findKV(kvs, "name"); kv.Kind != "str" || kv.V != `"alpha"` {
		t.Fatalf("name kv = %+v, want str/\"alpha\"", kv)
	}
	if kv, _ := findKV(kvs, "severity"); kv.Kind != "lvl" || kv.V != `"warn"` {
		t.Fatalf("severity kv = %+v, want lvl/\"warn\"", kv)
	}
	if kv, _ := findKV(kvs, "_timestamp"); kv.Kind != "num" || kv.V != "1751337480530000" {
		t.Fatalf("_timestamp kv = %+v, want num/1751337480530000", kv)
	}
}

func TestMapHitsMissingFields(t *testing.T) {
	rows := MapHits([]map[string]any{{"foo": "bar"}})
	r := rows[0]
	if r.Level != "" || r.Service != "" || r.Body != "" || r.LType != "" || r.Trace != "" {
		t.Fatalf("expected blank derived fields, got %+v", r)
	}
	if len(r.JSON) != 1 || r.JSON[0].K != "foo" {
		t.Fatalf("JSON = %+v, want single foo entry", r.JSON)
	}
}

func TestMapHistogramNormalizes(t *testing.T) {
	hits := []map[string]any{
		{"zo_sql_key": "2026-06-26T10:00:00", "zo_sql_num": float64(5)},
		{"zo_sql_key": "2026-06-26T10:00:30", "zo_sql_num": float64(20)},
		{"zo_sql_key": "2026-06-26T10:01:00", "zo_sql_num": float64(0)},
	}
	buckets := MapHistogram(hits)
	if len(buckets) != 3 {
		t.Fatalf("want 3 buckets, got %d", len(buckets))
	}
	if buckets[0].H != 0.25 || buckets[1].H != 1.0 || buckets[2].H != 0.0 {
		t.Fatalf("heights = %v, want [0.25 1 0]", []float64{buckets[0].H, buckets[1].H, buckets[2].H})
	}
	if buckets[1].T != "2026-06-26T10:00:30" {
		t.Fatalf("bucket label = %q", buckets[1].T)
	}
}

func TestMapHistogramEmpty(t *testing.T) {
	if got := MapHistogram(nil); len(got) != 0 {
		t.Fatalf("want empty, got %v", got)
	}
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/query/ -run Map
```
Expected: FAIL — `undefined: MapHits`, `undefined: MapHistogram`.

- [ ] **Step 3: Write `internal/query/map.go`**

```go
package query

import (
	"encoding/json"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Field-detection precedence lists. The first present key wins.
var (
	levelKeys   = []string{"level", "severity", "log_level", "severitytext"}
	serviceKeys = []string{"service_name", "service", "k8s_container_name"}
	bodyKeys    = []string{"body", "message", "msg", "log"}
	ltypeKeys   = []string{"metadata_log_type", "log_type"}
	traceKeys   = []string{"trace_id", "ctx_trace_id", "traceId"}
)

// MapHits converts raw search hits into the frontend's LogRow shape. Missing
// fields render blank; the detected level key is marked kind "lvl".
func MapHits(hits []map[string]any) []LogRow {
	rows := make([]LogRow, 0, len(hits))
	for i, hit := range hits {
		row := LogRow{ID: strconv.Itoa(i)}
		row.Time = formatTime(hit["_timestamp"])
		row.Level = strings.ToLower(firstString(hit, levelKeys))
		row.Service = firstString(hit, serviceKeys)
		row.Body = firstString(hit, bodyKeys)
		row.LType = firstString(hit, ltypeKeys)
		row.Trace = firstString(hit, traceKeys)

		levelKey := firstPresentKey(hit, levelKeys)
		row.JSON = buildKVs(hit, levelKey)
		rows = append(rows, row)
	}
	return rows
}

// MapHistogram reads the zo_sql_key / zo_sql_num columns and normalizes counts
// to [0,1] against the max count in the set.
func MapHistogram(hits []map[string]any) []Bucket {
	buckets := make([]Bucket, 0, len(hits))
	var max float64
	counts := make([]float64, len(hits))
	labels := make([]string, len(hits))
	for i, hit := range hits {
		labels[i] = asString(hit["zo_sql_key"])
		c := asFloat(hit["zo_sql_num"])
		counts[i] = c
		if c > max {
			max = c
		}
	}
	for i := range hits {
		h := 0.0
		if max > 0 {
			h = counts[i] / max
		}
		buckets = append(buckets, Bucket{T: labels[i], H: h})
	}
	return buckets
}

func firstPresentKey(hit map[string]any, keys []string) string {
	for _, k := range keys {
		if _, ok := hit[k]; ok {
			return k
		}
	}
	return ""
}

func firstString(hit map[string]any, keys []string) string {
	for _, k := range keys {
		if v, ok := hit[k]; ok {
			return asString(v)
		}
	}
	return ""
}

// buildKVs expands every key, sorted, typing each value. The levelKey (if any)
// is marked "lvl" so the drawer colors it.
func buildKVs(hit map[string]any, levelKey string) []KV {
	keys := make([]string, 0, len(hit))
	for k := range hit {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	kvs := make([]KV, 0, len(keys))
	for _, k := range keys {
		v := hit[k]
		kv := KV{K: k}
		switch {
		case k == levelKey:
			kv.Kind = "lvl"
			kv.V = `"` + asString(v) + `"`
		case isNumber(v):
			kv.Kind = "num"
			kv.V = formatNumber(v)
		default:
			kv.Kind = "str"
			kv.V = `"` + asString(v) + `"`
		}
		kvs = append(kvs, kv)
	}
	return kvs
}

func isNumber(v any) bool {
	switch v.(type) {
	case float64, float32, int, int64, json.Number:
		return true
	}
	return false
}

func formatNumber(v any) string {
	switch n := v.(type) {
	case float64:
		if n == math.Trunc(n) && math.Abs(n) < 1e18 {
			return strconv.FormatInt(int64(n), 10)
		}
		return strconv.FormatFloat(n, 'f', -1, 64)
	case json.Number:
		return n.String()
	default:
		return asString(v)
	}
}

// asString renders any JSON value as a plain (unquoted) string.
func asString(v any) string {
	switch s := v.(type) {
	case nil:
		return ""
	case string:
		return s
	case float64:
		return formatNumber(s)
	case bool:
		return strconv.FormatBool(s)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func asFloat(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case json.Number:
		f, _ := n.Float64()
		return f
	case int:
		return float64(n)
	case int64:
		return float64(n)
	default:
		return 0
	}
}

// formatTime renders _timestamp (epoch micros as a number, or an RFC3339
// string) as "YYYY-MM-DD HH:mm:ss.SSS" in local time. Unparseable values yield
// the raw string.
func formatTime(v any) string {
	const layout = "2006-01-02 15:04:05.000"
	switch t := v.(type) {
	case nil:
		return ""
	case float64:
		micros := int64(t)
		return time.UnixMicro(micros).Local().Format(layout)
	case string:
		if parsed, err := time.Parse(time.RFC3339Nano, t); err == nil {
			return parsed.Local().Format(layout)
		}
		return t
	default:
		return asString(v)
	}
}
```

Note on `TestMapHitsFieldDetection`'s time assertion: the formatted wall-clock depends on the test machine's local timezone, so the test only asserts the time is non-empty. The KV `_timestamp` assertion checks the raw numeric formatting, which is timezone-independent.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test ./internal/query/
```
Expected: PASS (all build + map tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/query/map.go internal/query/map_test.go
git commit -m "feat: heuristic hit to LogRow mapping and histogram normalization

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Bound methods on `App` + binding generation

This task has no unit tests (consistent with M1: live API paths are verified manually). Its gate is `go build ./...` and successful binding generation; the final whole-branch review and the manual live run verify behavior.

**Files (o3 repo):**
- Modify: `app.go`
- Generated (build artifact, commit it): `frontend/wailsjs/go/main/App.d.ts`, `frontend/wailsjs/go/main/App.js`, `frontend/wailsjs/go/models.ts`

**Interfaces:**
- Consumes: `config` (Task 3/4), `query` (Task 5/6), `apperr` (Task 2), and the CLI's `apiclient`, `pkgauth`.
- Produces (bound, TS generated):
  - `ConnConfig{ URL, Org, Scheme, Username, Secret string }` (Secret inbound only)
  - `ConnInfo{ OrgCount, StreamCount int }`
  - `StreamInfo{ Name, StreamType string; Docs int64; Size string }`
  - `Field{ Name, Type string }`
  - `func (a *App) TestConnection(c ConnConfig) (ConnInfo, error)`
  - `func (a *App) SaveConnection(c ConnConfig) error`
  - `func (a *App) LoadConnection() (ConnConfig, error)`
  - `func (a *App) ListStreams() ([]StreamInfo, error)`
  - `func (a *App) GetFields(stream string) ([]Field, error)`
  - `func (a *App) RunQuery(p query.SearchParams) (query.SearchResult, error)`

- [ ] **Step 1: Replace the contents of `app.go`**

```go
package main

import (
	"context"
	"fmt"
	"sync"

	api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"

	"github.com/angelmsger/openobserve-desktop/internal/apperr"
	"github.com/angelmsger/openobserve-desktop/internal/config"
	"github.com/angelmsger/openobserve-desktop/internal/query"
)

// App is the Wails-bound application. It owns the loaded connection config and
// a lazily-built, shared API client.
type App struct {
	ctx context.Context

	mu     sync.Mutex
	cfg    config.Config
	client api.Client // nil until a credential is configured
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup loads any saved connection and builds the client if a secret exists.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	dir, err := config.DataDir()
	if err != nil {
		return
	}
	cfg, err := config.Load(dir)
	if err != nil || cfg.URL == "" {
		return
	}
	a.mu.Lock()
	a.cfg = cfg
	a.mu.Unlock()
	_ = a.rebuildClient() // best-effort; data methods re-report if it fails
}

// ConnConfig is the connection settings exchanged with the frontend. Secret is
// inbound only (Save/Test); it is never returned by LoadConnection.
type ConnConfig struct {
	URL      string `json:"url"`
	Org      string `json:"org"`
	Scheme   string `json:"scheme"`
	Username string `json:"username"`
	Secret   string `json:"secret"`
}

// ConnInfo summarizes a verified connection.
type ConnInfo struct {
	OrgCount    int `json:"orgCount"`
	StreamCount int `json:"streamCount"`
}

// StreamInfo describes one stream for the picker.
type StreamInfo struct {
	Name       string `json:"name"`
	StreamType string `json:"streamType"`
	Docs       int64  `json:"docs"`
	Size       string `json:"size"`
}

// Field is one schema field.
type Field struct {
	Name string `json:"name"`
	Type string `json:"type"`
}

// credentialOf builds a pkgauth.Credential from a ConnConfig, defaulting the
// scheme to basic.
func credentialOf(c ConnConfig) pkgauth.Credential {
	scheme := c.Scheme
	if scheme == "" {
		scheme = pkgauth.SchemeBasic
	}
	return pkgauth.Credential{Scheme: scheme, Username: c.Username, Secret: c.Secret}
}

// buildClient assembles an authenticated client for c (with secret present).
func buildClient(c ConnConfig) (api.Client, error) {
	cred := credentialOf(c)
	if err := cred.Validate(); err != nil {
		return nil, err
	}
	return api.Build(api.BuildParams{
		BaseURL:       c.URL,
		Org:           orgOrDefault(c.Org),
		AuthDecorator: cred.Decorator(),
	})
}

func orgOrDefault(org string) string {
	if org == "" {
		return "default"
	}
	return org
}

// rebuildClient rebuilds a.client from a.cfg plus the stored secret. It returns
// a not-configured error when no secret is available.
func (a *App) rebuildClient() error {
	a.mu.Lock()
	cfg := a.cfg
	a.mu.Unlock()

	scheme := cfg.Scheme
	if scheme == "" {
		scheme = pkgauth.SchemeBasic
	}
	secret, ok, err := config.LoadSecret(cfg.URL, scheme)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok {
		return apperr.NotConfigured("no stored credential")
	}
	client, err := buildClient(ConnConfig{
		URL: cfg.URL, Org: cfg.Org, Scheme: scheme, Username: cfg.Username, Secret: secret,
	})
	if err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.client = client
	a.mu.Unlock()
	return nil
}

// requireClient returns the built client or a not-configured error.
func (a *App) requireClient() (api.Client, error) {
	a.mu.Lock()
	client := a.client
	a.mu.Unlock()
	if client == nil {
		if err := a.rebuildClient(); err != nil {
			return nil, err
		}
		a.mu.Lock()
		client = a.client
		a.mu.Unlock()
	}
	if client == nil {
		return nil, apperr.NotConfigured("not connected")
	}
	return client, nil
}

// TestConnection verifies credentials against the server without persisting
// them. It pings (lists orgs) and counts streams in the target org.
func (a *App) TestConnection(c ConnConfig) (ConnInfo, error) {
	client, err := buildClient(c)
	if err != nil {
		return ConnInfo{}, apperr.Wrap(err)
	}
	orgs, err := client.Ping(a.ctx)
	if err != nil {
		return ConnInfo{}, apperr.Wrap(err)
	}
	info := ConnInfo{OrgCount: len(orgs)}
	if streams, err := client.ListStreams(a.ctx, orgOrDefault(c.Org), "logs", false); err == nil {
		info.StreamCount = len(streams)
	}
	return info, nil
}

// SaveConnection persists the config (JSON) and secret (keychain), then
// rebuilds the client.
func (a *App) SaveConnection(c ConnConfig) error {
	cred := credentialOf(c)
	if err := cred.Validate(); err != nil {
		return apperr.Wrap(err)
	}
	dir, err := config.DataDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	cfg := config.Config{URL: c.URL, Org: orgOrDefault(c.Org), Scheme: cred.Scheme, Username: c.Username}
	if err := config.Save(dir, cfg); err != nil {
		return apperr.Wrap(err)
	}
	if err := config.SaveSecret(c.URL, cred.Scheme, c.Secret); err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.cfg = cfg
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// LoadConnection returns the saved config without the secret. A zero URL means
// the app is unconfigured (the UI opens the setup wizard).
func (a *App) LoadConnection() (ConnConfig, error) {
	dir, err := config.DataDir()
	if err != nil {
		return ConnConfig{}, apperr.Wrap(err)
	}
	cfg, err := config.Load(dir)
	if err != nil {
		return ConnConfig{}, apperr.Wrap(err)
	}
	return ConnConfig{URL: cfg.URL, Org: cfg.Org, Scheme: cfg.Scheme, Username: cfg.Username}, nil
}

// ListStreams returns the logs streams in the configured org.
func (a *App) ListStreams() ([]StreamInfo, error) {
	client, err := a.requireClient()
	if err != nil {
		return nil, err
	}
	streams, err := client.ListStreams(a.ctx, client.DefaultOrg(), "logs", true)
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	out := make([]StreamInfo, 0, len(streams))
	for _, s := range streams {
		si := StreamInfo{Name: s.Name, StreamType: s.StreamType}
		if s.Stats != nil {
			si.Docs = s.Stats.DocNum
			si.Size = humanBytes(s.Stats.StorageSize)
		}
		out = append(out, si)
	}
	return out, nil
}

// GetFields returns the schema fields for one stream.
func (a *App) GetFields(stream string) ([]Field, error) {
	client, err := a.requireClient()
	if err != nil {
		return nil, err
	}
	s, err := client.GetStream(a.ctx, client.DefaultOrg(), stream, "logs")
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	out := make([]Field, 0, len(s.Schema))
	for _, f := range s.Schema {
		out = append(out, Field{Name: f.Name, Type: f.Type})
	}
	return out, nil
}

// RunQuery executes the search and (optionally) the histogram, mapping both to
// the frontend's shapes.
func (a *App) RunQuery(p query.SearchParams) (query.SearchResult, error) {
	client, err := a.requireClient()
	if err != nil {
		return query.SearchResult{}, err
	}
	size := p.Size
	if size <= 0 {
		size = 100
	}
	resp, err := client.Search(a.ctx, client.DefaultOrg(), api.SearchRequest{
		Query: api.SearchQuery{
			SQL:       p.SQL,
			StartTime: p.StartMicros,
			EndTime:   p.EndMicros,
			From:      p.From,
			Size:      size,
		},
	})
	if err != nil {
		return query.SearchResult{}, apperr.Wrap(err)
	}
	result := query.SearchResult{
		Meta: query.QueryMeta{Total: resp.Total, TookMs: resp.Took, ScanBytes: resp.ScanSize},
		Rows: query.MapHits(resp.Hits),
	}
	if p.Histogram {
		interval := query.Interval(p.StartMicros, p.EndMicros)
		hResp, herr := client.Search(a.ctx, client.DefaultOrg(), api.SearchRequest{
			Query: api.SearchQuery{
				SQL:       query.HistogramSQL(p.Stream, interval),
				StartTime: p.StartMicros,
				EndTime:   p.EndMicros,
				Size:      0,
			},
		})
		if herr == nil {
			result.Histogram = query.MapHistogram(hResp.Hits)
		}
	}
	return result, nil
}

// humanBytes formats a byte count as a short human string (e.g. "1.2 MB").
func humanBytes(b float64) string {
	const unit = 1024.0
	if b < unit {
		return fmt.Sprintf("%.0f B", b)
	}
	div, exp := unit, 0
	for n := b / unit; n >= unit && exp < 4; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", b/div, "KMGT"[exp])
}
```

- [ ] **Step 2: Build the Go module**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go build ./...
```
Expected: builds. If `api.Client` lacks `DefaultOrg()` at compile time, it is present per the confirmed interface; a failure here means an import or signature typo — fix it.

- [ ] **Step 3: Generate the Wails TS bindings**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails generate module
```
Expected: regenerates `frontend/wailsjs/go/main/App.{js,d.ts}` and `frontend/wailsjs/go/models.ts` containing `TestConnection`, `SaveConnection`, `LoadConnection`, `ListStreams`, `GetFields`, `RunQuery` and the `main.ConnConfig`/`ConnInfo`/`StreamInfo`/`Field` + `query.SearchParams`/`SearchResult`/`LogRow`/`KV`/`Bucket`/`QueryMeta` models. If `wails` is not on PATH, install/locate it (`go run github.com/wailsapp/wails/v2/cmd/wails generate module`).

- [ ] **Step 4: Verify sibling clean + bindings present**

```bash
git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain   # expect empty
ls /Users/angelmsger/Development/Workspaces/o3/frontend/wailsjs/go/main/
```
Expected: sibling clean; `App.js` and `App.d.ts` exist and reference the six methods.

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add app.go frontend/wailsjs/
git commit -m "feat: bound methods for live connection, streams, fields, and search

Add TestConnection/SaveConnection/LoadConnection/ListStreams/GetFields/RunQuery
on App, building the shared apiclient lazily from keychain credentials, and
regenerate the Wails TS bindings.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Frontend wiring (live data, states, auto-wizard)

This task has no unit tests (consistent with M1). Its gate is a clean `wails build` (TypeScript compiles) and a manual live run.

**Files (o3 repo):**
- Modify: `frontend/src/components/Histogram.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: generated bindings `import { TestConnection, SaveConnection, LoadConnection, ListStreams, GetFields, RunQuery } from '../wailsjs/go/main/App'`; existing `types.ts` shapes (binding results are structurally compatible).
- Produces: live-data UI with loading/empty/error states.

- [ ] **Step 1: Give `Histogram` a live `bars` prop**

In `frontend/src/components/Histogram.tsx`, change the props to accept bars and render them, falling back to nothing when empty. Replace the props interface and the bar source:

```tsx
import { HistoBar } from '../types';

interface HistogramProps {
  accent: string;
  bars: HistoBar[];
}
```

Then, wherever the component currently derives bars from mock/`format.ts`, use the `bars` prop instead. Render each bar's height from `bar.h` (0..1) exactly as before. If `bars.length === 0`, render the existing empty chart frame (no columns). Keep all existing class names, axis labels, and the `accent` coloring unchanged.

(The reviewer should confirm only the data source changed — not the visual structure. The exact JSX edit depends on the current file; the implementer reads `Histogram.tsx` and swaps the bar array source while preserving markup.)

- [ ] **Step 2: Add live state and binding calls to `App.tsx`**

Add near the other `useState` declarations:

```tsx
import {
  LoadConnection, SaveConnection, TestConnection,
  ListStreams, GetFields, RunQuery,
} from '../wailsjs/go/main/App';
import type { LogRow as TLogRow, Field as TField, HistoBar } from './types';

// live-data state
const [liveRows, setLiveRows] = useState<TLogRow[]>([]);
const [liveFields, setLiveFields] = useState<TField[]>([]);
const [liveStreams, setLiveStreams] = useState<{ name: string; size: string; color: string }[]>([]);
const [liveBars, setLiveBars] = useState<HistoBar[]>([]);
const [liveMeta, setLiveMeta] = useState<{ total: number; tookMs: number; shown: number }>({ total: 0, tookMs: 0, shown: 0 });
const [loading, setLoading] = useState(false);
const [queryError, setQueryError] = useState<{ message: string; hint: string } | null>(null);
const [configured, setConfigured] = useState<boolean>(true);
```

Add a palette + helper to assign stream colors (the picker needs a color the live API does not provide):

```tsx
const STREAM_PALETTE = ['#2dd4bf', '#60a5fa', '#f59e0b', '#a78bfa', '#f4685f', '#34d399'];
const withColors = (streams: { name: string; size: string }[]) =>
  streams.map((s, i) => ({ ...s, color: STREAM_PALETTE[i % STREAM_PALETTE.length] }));
```

- [ ] **Step 3: Load connection on startup; auto-open the wizard when unconfigured**

Add an effect that runs once on mount:

```tsx
useEffect(() => {
  LoadConnection()
    .then((c) => {
      if (!c.url) {
        setConfigured(false);
        setSetupOpen(true);
        return;
      }
      setConn((prev) => ({ ...prev, url: c.url, org: c.org, email: c.username }));
      setConfigured(true);
      return ListStreams().then((s) => {
        const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
        setLiveStreams(mapped);
        if (mapped.length > 0) setStream(mapped[0].name);
      });
    })
    .catch(() => { setConfigured(false); setSetupOpen(true); });
}, []);
```

- [ ] **Step 4: Wire the stream selector to load fields**

Add an effect keyed on `stream` (after a connection exists):

```tsx
useEffect(() => {
  if (!configured || !stream) return;
  GetFields(stream)
    .then((f) => setLiveFields(f))
    .catch(() => setLiveFields([]));
}, [stream, configured]);
```

And change the `FieldsPanel` props to use live data when present:

```tsx
streams={liveStreams.length ? liveStreams : STREAMS}
fields={liveFields.length ? liveFields : FIELDS}
```

- [ ] **Step 5: Make the Run button execute a live query**

Replace the current `onRun={() => setRunning((v) => !v)}` with a handler that builds `SearchParams` from the current query/stream/time and calls `RunQuery`. Compute the time window from the relative picker state (`relAmount`/`relUnit`) using a small client-side helper that mirrors the Go logic for the request (the Go side recomputes authoritatively; the frontend only needs micros to send):

```tsx
const computeRange = (): { startMicros: number; endMicros: number } => {
  const now = Date.now() * 1000; // micros
  const amount = parseInt(relAmount, 10) || 15;
  const unitMicros: Record<string, number> = {
    s: 1e6, m: 60e6, h: 3600e6, d: 86400e6, w: 604800e6,
  };
  const span = amount * (unitMicros[relUnit] ?? 60e6);
  return { startMicros: Math.round(now - span), endMicros: Math.round(now) };
};

const runQuery = async () => {
  setRunning(true);
  setLoading(true);
  setQueryError(null);
  const { startMicros, endMicros } = computeRange();
  try {
    const res = await RunQuery({
      stream,
      sql: query,
      startMicros,
      endMicros,
      from: 0,
      size: 100,
      histogram: showHistogram,
    });
    setLiveRows(res.rows ?? []);
    setLiveBars(res.histogram ?? []);
    setLiveMeta({ total: Number(res.meta?.total ?? 0), tookMs: res.meta?.tookMs ?? 0, shown: (res.rows ?? []).length });
  } catch (e: any) {
    setQueryError({ message: e?.message ?? String(e), hint: e?.hint ?? '' });
    setLiveRows([]);
    setLiveBars([]);
  } finally {
    setRunning(false);
    setLoading(false);
  }
};
```

Set `onRun={runQuery}` on `QueryEditor`.

- [ ] **Step 6: Feed live data into Histogram, ResultsHeader, ResultsTable, Drawer**

Update the render to prefer live data:

```tsx
<Histogram accent={accent} bars={liveBars} />
```

```tsx
<ResultsHeader
  shownCount={liveMeta.shown}
  totalEvents={liveMeta.total.toLocaleString()}
  queryMs={liveMeta.tookMs}
/>
```

```tsx
<ResultsTable
  rows={liveRows}
  selectedId={selectedRow}
  density={density}
  accent={accent}
  onSelectRow={(id) => setSelectedRow((prev) => (prev === id ? null : id))}
  onLevelCtx={openCtx}
  onServiceCtx={openCtx}
/>
```

And for the drawer, look up the selected row in `liveRows`:

```tsx
{drawerRowId && liveRows.find((r) => r.id === drawerRowId) && (
  <DrawerInspector
    row={liveRows.find((r) => r.id === drawerRowId)!}
    visible={drawerVisible}
    onClose={() => setSelectedRow(null)}
    onKvCtx={openCtx}
  />
)}
```

- [ ] **Step 7: Add loading / empty / error states in the results area**

Wrap the results region so that:
- when `loading` is true → show a centered spinner/skeleton (reuse the existing motion/`ooPulse` styles);
- else when `queryError` → show an error banner above the results with `queryError.message` and, if present, `queryError.hint`;
- else when `liveRows.length === 0` → show a "No results" empty state;
- else → render `ResultsTable` as in Step 6.

Concrete structure (place inside the center column, replacing the bare `ResultsTable`):

```tsx
{loading ? (
  <div className={styles.stateCenter}>
    <div className={styles.spinner} />
    <span>Running query…</span>
  </div>
) : queryError ? (
  <div className={styles.errorBanner}>
    <strong>{queryError.message}</strong>
    {queryError.hint && <span>{queryError.hint}</span>}
  </div>
) : liveRows.length === 0 ? (
  <div className={styles.stateCenter}>No results for this query and time range.</div>
) : (
  <ResultsTable /* …props as Step 6… */ />
)}
```

Add the supporting classes to `frontend/src/App.module.css` (match the existing dark palette and motion tokens):

```css
.stateCenter {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: #5b6371;
  font-size: 12px;
}
.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.12);
  border-top-color: var(--accent, #2dd4bf);
  animation: ooSpin 0.7s linear infinite;
}
@keyframes ooSpin { to { transform: rotate(360deg); } }
.errorBanner {
  margin: 10px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: color-mix(in srgb, #f4685f 12%, transparent);
  border: 1px solid color-mix(in srgb, #f4685f 40%, transparent);
  color: #f4a39c;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
```

(`@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }` — add to the existing reduced-motion block in `tokens.css`.)

- [ ] **Step 8: Back the setup wizard's Test/Save with live calls**

The `SetupWizard` already exposes `onTest` and a close action. Wire `onTest` to call `TestConnection` with the current `conn` fields, show the result (org/stream counts) via the existing `tested` flag, and on a successful save call `SaveConnection`, then `setConfigured(true)`, close the wizard, and trigger `ListStreams`. Map a returned `AppError` with `category === 'not_configured'` or any connection error to an inline message in the wizard (reuse the wizard's existing error/feedback affordance; if none exists, add a small text line under the Test button).

Concrete handlers in `App.tsx`:

```tsx
const handleTest = async () => {
  try {
    const scheme = authTab === 'token' ? 'token' : 'basic';
    await TestConnection({
      url: conn.url, org: conn.org, scheme,
      username: conn.email ?? '',
      secret: (scheme === 'token' ? conn.token : conn.password) ?? '',
    });
    setTested(true);
  } catch (e: any) {
    setTested(false);
    setQueryError({ message: e?.message ?? String(e), hint: e?.hint ?? '' });
  }
};

const handleSaveConnection = async () => {
  const scheme = authTab === 'token' ? 'token' : 'basic';
  await SaveConnection({
    url: conn.url, org: conn.org, scheme,
    username: conn.email ?? '',
    secret: (scheme === 'token' ? conn.token : conn.password) ?? '',
  });
  setConfigured(true);
  setSetupOpen(false);
  const s = await ListStreams();
  const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
  setLiveStreams(mapped);
  if (mapped.length > 0) setStream(mapped[0].name);
};
```

Pass `onTest={handleTest}` to `SetupWizard`. If `SetupWizard`'s prop set lacks a save/confirm callback, add an `onSave?: () => void` prop to its interface and a confirm button that calls it (wired to `handleSaveConnection`); keep the addition minimal and consistent with the wizard's existing layout.

- [ ] **Step 9: Build the app (TypeScript must compile)**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: frontend builds with no TypeScript errors; a desktop binary is produced. (Build-only check; runtime behavior is verified manually in Step 10.)

- [ ] **Step 10: Manual live verification (developer-run)**

Run `wails dev`, open the app:
- With no saved config → the setup wizard auto-opens.
- Enter a real OpenObserve URL/org/email/password → Test shows org/stream counts → Save closes the wizard.
- The stream picker lists real streams; selecting one loads real fields.
- Type a SQL query, pick a time range, click Run → the table shows real rows, the drawer opens a real row, the histogram shows real buckets, the header shows real total/took.
- Force an error (bad SQL) → the error banner shows message + hint; empty time range → "No results".

- [ ] **Step 11: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/App.tsx frontend/src/components/Histogram.tsx frontend/src/App.module.css frontend/src/styles/tokens.css
git commit -m "feat: wire Logs explorer to live backend with loading/empty/error states

Replace mock arrays with RunQuery/ListStreams/GetFields bindings, auto-open
the setup wizard when unconfigured, back Test/Save with live calls, and feed
live rows/fields/streams/histogram into the existing UI.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-26-openobserve-desktop-m2-live-data-design.md`):
- §3 `pkg/auth` extraction → Task 1. ✓
- §4 module wiring (require, no `go work sync`) → Task 2 + Global Constraints. ✓
- §5 Go files: `app.go` → Task 7; `config/config.go` + paths → Task 3; `config/secret.go` → Task 4; `query/build.go` + test → Task 5; `query/map.go` + test → Task 6; `apperr/apperr.go` → Task 2. ✓
- §5 bound methods (all six) → Task 7. ✓ (Spec's `ConnInfo.Version` dropped: the `Client` interface exposes no version endpoint — `ConnInfo` carries `OrgCount`/`StreamCount` only. Noted as an intentional deviation.)
- §6 heuristic mapping (time/level/service/body/json kinds, missing→blank) → Task 6. ✓ Plus `ltype`/`trace` added to match the real frontend `LogRow`.
- §7 time→micros + interval + `histogram(...)` → Task 5. ✓ (Interval is word-form per the CLI, not literal `'30s'`.)
- §8 frontend wiring + auto-wizard + states → Task 8. ✓
- §9 error handling (`apperr` {category,message,hint}, placement) → Task 2 + Task 8. ✓
- §10 testing (table-driven map+build; auth header tests; live manual) → Tasks 1,5,6 (unit) + Tasks 7,8 (manual). ✓
- §11 risks (sibling dirtying, keychain prompt) → Global Constraints + per-task sibling-clean checks + Task 4 skip-on-unavailable. ✓
- Non-goals (history persistence, live autocomplete, traces/metrics, tail, query builder, per-stream mapping) → none added. ✓ Histogram is unfiltered (stream + time only) for this slice — a deliberate simplification noted here.

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". Two steps (Task 8 Step 1 Histogram, Task 8 Step 8 wizard save prop) describe an edit against a file whose exact current JSX the implementer must read; both give the concrete target shape, the constraint (preserve markup / minimal addition), and the prop/handler code. This is intentional — those two files' current contents weren't quoted in full in the plan — and is bounded, not a blank placeholder.

**3. Type consistency:** `query.SearchParams`/`SearchResult`/`LogRow`/`KV`/`Bucket`/`QueryMeta` defined in Task 5 `types.go` are consumed unchanged by Task 6 (`MapHits`/`MapHistogram` return `[]LogRow`/`[]Bucket`) and Task 7 (`RunQuery(p query.SearchParams) (query.SearchResult, error)`). JSON tags (`id/time/level/service/body/ltype/trace/json`, `k/v/kind`, `t/h`, `total/tookMs/scanBytes`) match the frontend `types.ts` (`LogRow`, KV, `HistoBar.h`) and the frontend's consumption in Task 8. `pkgauth.Credential{Scheme,Username,Secret}` + `SchemeBasic` are used identically in Tasks 1, 4, 7. `config.Config{URL,Org,Scheme,Username}` and `config.{Load,Save,DataDir,SaveSecret,LoadSecret,DeleteSecret}` defined in Tasks 3-4 are called with matching signatures in Task 7. `apperr.{Wrap,NotConfigured,CategoryNotConfigured}` defined in Task 2 are used in Task 7. `api.{Build,BuildParams,Client,SearchRequest,SearchQuery}` and `Stream.Stats.{DocNum,StorageSize}`/`Stream.Schema[].{Name,Type}` match the confirmed CLI surface. Consistent. ✓
