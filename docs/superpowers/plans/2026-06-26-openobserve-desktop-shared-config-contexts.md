# OpenObserve Desktop — Shared Config + Multi-Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make o3 read and write the CLI's shared `~/.angelmsger/openobserve/config.yaml` (two-way) and add a kubectl-style multi-context UI, reusing the CLI's config code so the two tools cannot diverge.

**Architecture:** Extract the CLI's persistent config layer (`internal/config/file.go`) into a public `pkg/config` (alias-shim the old package, same as the earlier `pkg/auth` move); o3 consumes it to list/switch/upsert/remove contexts against the shared YAML, resolving each context's secret from the already-shared keychain. The frontend gains a title-bar switcher, a Settings contexts manager, and a multi-context wizard.

**Tech Stack:** Go 1.24, Wails v2, React 18 + TypeScript + Vite, `github.com/angelmsger/openobserve-cli` (sibling module via `go.work` + `replace`), `gopkg.in/yaml.v3`, `github.com/zalando/go-keyring`.

## Global Constraints

- **Reuse, do not reimplement:** o3's server config goes through the CLI's `pkg/config`; auth/HTTP through `pkg/auth`/`pkg/apiclient`. No duplicated YAML schema or auth logic in o3.
- **Never run `go work sync`** (it rewrites the sibling CLI's go.mod/go.sum). After any module-touching Go command, verify: `git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain` prints nothing (except a deliberate CLI-repo commit a task explicitly makes).
- **Shared config file:** `~/.angelmsger/openobserve/config.yaml`; YAML; `defaults:` block is OPTIONAL (the user's real file omits it). Secrets are NEVER written to the YAML.
- **Keychain is the shared credential store:** service `"openobserve-cli"`, account key `pkgauth.AccountKey(url, scheme)` = `host:scheme`. o3 stays keychain-only (no file fallback).
- **Field mapping:** design `auth: 'password'` ↔ scheme `basic`; `auth: 'token'` ↔ scheme `token`. design `email` ↔ `auth.username`; `url` ↔ `server`. `color`/`selfSigned`/`id` are UI-only, never persisted.
- **Secret rules:** o3 never sends secrets to the frontend (`ContextInfo` has `HasSecret bool`, not the secret). `SaveContext` writes the keychain secret only when a non-empty `Secret` is provided. `TestConnection` falls back to the stored keychain secret when `Secret` is empty.
- **Min one context:** `RemoveContext` refuses to delete the last context.
- **Pixel/label fidelity:** all frontend markup follows the committed `design/Observe.dc.html` (the multi-context update).
- **ASCII half-width punctuation** in Go comments, commit messages, and Chinese content; PascalCase brand terms in prose.
- **CLI cross-repo edits** happen in `/Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli` (module `github.com/angelmsger/openobserve-cli`).

---

## File Structure

**CLI repo (`oa-cli/src/openobserve-cli`) — Task 1 only:**
- Create `pkg/config/config.go` — `File`, `NamedContext`, `Defaults`, `AuthConfig`, the YAML shape structs, `ReadFile`/`WriteFile`, path helpers, `Context`/`ContextNames`/`Upsert`/`Remove` methods, unexported `defaultsFromShape`/`durationOr`/`put`.
- Create `pkg/config/config_test.go` — table-driven round-trip + context-helper tests.
- Replace `internal/config/file.go` — alias shim re-exporting the moved symbols.

**o3 repo — Tasks 2-4:**
- `go.mod` — already requires the CLI; no change beyond the new import.
- Delete `internal/config/config.go`, `internal/config/paths.go`, `internal/config/config_test.go` (the JSON store). Keep `internal/config/secret.go`.
- `app.go` — context-aware bound methods + client built from the current context.
- `app_contexts_test.go` — pure `contextInfos` mapping test.
- `frontend/wailsjs/go/...` — regenerated bindings.
- `frontend/src/App.tsx` — contexts state, startup load, switch/add/save/remove handlers.
- `frontend/src/components/TitleBar.tsx` — context switcher button + dropdown.
- `frontend/src/components/SetupWizard.tsx` — multi-context wizard.
- `frontend/src/components/SettingsModal.tsx` — Connection-tab contexts manager + edit-active form.

---

### Task 1: Extract `pkg/config` in the CLI repo

**Files (all under `/Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli`):**
- Create: `pkg/config/config.go`
- Create: `pkg/config/config_test.go`
- Modify (replace contents): `internal/config/file.go`

**Interfaces:**
- Consumes: `pkg/constants` (`ConfigParentDirName`, `ConfigDirName`, `ConfigFileName`), `gopkg.in/yaml.v3`.
- Produces (importable as `github.com/angelmsger/openobserve-cli/pkg/config`):
  - `type AuthConfig struct { Scheme string \`yaml:"scheme"\`; Username string \`yaml:"username,omitempty"\` }`
  - `type Defaults struct { Format string; Timeout time.Duration; MaxRetries int; ReadOnly bool }` (with yaml tags as below)
  - `type NamedContext struct { Name, BaseURL, Org string; Auth AuthConfig }`
  - `type File struct { CurrentContext string; Contexts []NamedContext; Defaults Defaults }`
  - `func DefaultConfigDir() (string, error)`, `func ResolveConfigDir() (string, error)`, `func ConfigFilePath(dir string) string`
  - `func ReadFile(dir string) (File, bool, error)`, `func WriteFile(dir string, f File) error`
  - `func (f File) Context(name string) (NamedContext, bool)`, `func (f File) ContextNames() []string`, `func (f *File) Upsert(nc NamedContext)`, `func (f *File) Remove(name string) bool`

- [ ] **Step 1: Create `pkg/config/config.go`** (moved verbatim from `internal/config/file.go`, package renamed to `config`, plus a new `Remove` method and a local `durationOr`)

```go
// Package config is the OpenObserve config-file model shared by the CLI and the
// desktop GUI: the on-disk YAML schema (named contexts + current context +
// shared defaults), file IO, and context helpers. Secrets are never stored
// here; they live in the OS keychain. The CLI's layered loader (flags/env/file)
// builds on this package.
package config

import (
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/angelmsger/openobserve-cli/pkg/constants"
	"gopkg.in/yaml.v3"
)

// --- on-disk YAML shapes ---

type authShape struct {
	Scheme   string `yaml:"scheme,omitempty"`
	Username string `yaml:"username,omitempty"`
}

type defaultsShape struct {
	Format     string `yaml:"format,omitempty"`
	Timeout    string `yaml:"timeout,omitempty"`
	MaxRetries int    `yaml:"max_retries,omitempty"`
	ReadOnly   bool   `yaml:"read_only,omitempty"`
}

type contextShape struct {
	Name   string    `yaml:"name"`
	Server string    `yaml:"server,omitempty"`
	Org    string    `yaml:"org,omitempty"`
	Auth   authShape `yaml:"auth,omitempty"`
}

// fileShape is the on-disk YAML representation of the config file.
type fileShape struct {
	CurrentContext string         `yaml:"current_context,omitempty"`
	Contexts       []contextShape `yaml:"contexts,omitempty"`
	Defaults       defaultsShape  `yaml:"defaults,omitempty"`
}

// --- public model ---

// AuthConfig is the per-context auth settings persisted to the file.
type AuthConfig struct {
	Scheme   string `yaml:"scheme"`
	Username string `yaml:"username,omitempty"`
}

// Defaults are runtime defaults shared across contexts.
type Defaults struct {
	Format     string        `yaml:"format"`
	Timeout    time.Duration `yaml:"timeout"`
	MaxRetries int           `yaml:"max_retries"`
	ReadOnly   bool          `yaml:"read_only,omitempty"`
}

// NamedContext is one named OpenObserve server profile inside the config file.
type NamedContext struct {
	Name    string
	BaseURL string
	Org     string
	Auth    AuthConfig
}

// File is the parsed config file: named contexts plus shared defaults and the
// name of the current context.
type File struct {
	CurrentContext string
	Contexts       []NamedContext
	Defaults       Defaults
}

// Context returns the context whose name matches, case-insensitively.
func (f File) Context(name string) (NamedContext, bool) {
	for _, c := range f.Contexts {
		if strings.EqualFold(c.Name, name) {
			return c, true
		}
	}
	return NamedContext{}, false
}

// ContextNames returns every context name, in file order.
func (f File) ContextNames() []string {
	names := make([]string, len(f.Contexts))
	for i, c := range f.Contexts {
		names[i] = c.Name
	}
	return names
}

// Upsert inserts or replaces a context by case-insensitive name, preserving
// file order for existing entries.
func (f *File) Upsert(nc NamedContext) {
	for i, c := range f.Contexts {
		if strings.EqualFold(c.Name, nc.Name) {
			f.Contexts[i] = nc
			return
		}
	}
	f.Contexts = append(f.Contexts, nc)
}

// Remove deletes the context with the given (case-insensitive) name, preserving
// order. It reports whether a context was removed.
func (f *File) Remove(name string) bool {
	for i, c := range f.Contexts {
		if strings.EqualFold(c.Name, name) {
			f.Contexts = append(f.Contexts[:i], f.Contexts[i+1:]...)
			return true
		}
	}
	return false
}

// --- paths ---

// DefaultConfigDir returns the per-user config directory
// (~/.angelmsger/openobserve).
func DefaultConfigDir() (string, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, constants.ConfigParentDirName, constants.ConfigDirName), nil
}

// ResolveConfigDir picks the config directory to use when --config was not
// supplied.
func ResolveConfigDir() (string, error) {
	return DefaultConfigDir()
}

// ConfigFilePath returns the YAML config file path inside dir.
func ConfigFilePath(dir string) string {
	return filepath.Join(dir, constants.ConfigFileName)
}

// --- file IO ---

// ReadFile reads and parses the config file in dir. The bool return is false
// when the file does not exist.
func ReadFile(dir string) (File, bool, error) {
	raw, err := os.ReadFile(ConfigFilePath(dir))
	if err != nil {
		if os.IsNotExist(err) {
			return File{}, false, nil
		}
		return File{}, false, err
	}
	var fs fileShape
	if err := yaml.Unmarshal(raw, &fs); err != nil {
		return File{}, false, err
	}
	f := File{
		CurrentContext: fs.CurrentContext,
		Defaults:       defaultsFromShape(fs.Defaults),
	}
	for _, cs := range fs.Contexts {
		f.Contexts = append(f.Contexts, NamedContext{
			Name:    cs.Name,
			BaseURL: cs.Server,
			Org:     cs.Org,
			Auth:    AuthConfig{Scheme: cs.Auth.Scheme, Username: cs.Auth.Username},
		})
	}
	return f, true, nil
}

// WriteFile persists a File to dir/config.yaml, creating dir with 0700
// permissions. Secrets are never written here.
func WriteFile(dir string, f File) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	var fs fileShape
	fs.CurrentContext = f.CurrentContext
	for _, c := range f.Contexts {
		fs.Contexts = append(fs.Contexts, contextShape{
			Name:   c.Name,
			Server: c.BaseURL,
			Org:    c.Org,
			Auth:   authShape{Scheme: c.Auth.Scheme, Username: c.Auth.Username},
		})
	}
	fs.Defaults.Format = f.Defaults.Format
	if f.Defaults.Timeout > 0 {
		fs.Defaults.Timeout = f.Defaults.Timeout.String()
	}
	fs.Defaults.MaxRetries = f.Defaults.MaxRetries
	fs.Defaults.ReadOnly = f.Defaults.ReadOnly

	out, err := yaml.Marshal(&fs)
	if err != nil {
		return err
	}
	return os.WriteFile(ConfigFilePath(dir), out, 0o600)
}

func defaultsFromShape(ds defaultsShape) Defaults {
	return Defaults{
		Format:     ds.Format,
		Timeout:    durationOr(ds.Timeout, 0),
		MaxRetries: ds.MaxRetries,
		ReadOnly:   ds.ReadOnly,
	}
}

func durationOr(s string, fallback time.Duration) time.Duration {
	if s == "" {
		return fallback
	}
	if d, err := time.ParseDuration(s); err == nil {
		return d
	}
	return fallback
}
```

Note: the `put` helper from the old `file.go` is dropped here — it is not used by any moved function. If, when you replace `internal/config/file.go`, the CLI fails to build because some OTHER `internal/config` file referenced `put`, restore a copy of `put` there (it stays internal). Verify with the build in Step 4.

- [ ] **Step 2: Write `pkg/config/config_test.go`** (the CLI's persistent layer had no unit tests; the package is now public)

```go
package config

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func writeYAML(t *testing.T, dir, body string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "config.yaml"), []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestReadFileMissing(t *testing.T) {
	f, ok, err := ReadFile(t.TempDir())
	if err != nil {
		t.Fatalf("ReadFile missing: %v", err)
	}
	if ok {
		t.Fatal("expected ok=false for missing file")
	}
	if len(f.Contexts) != 0 {
		t.Fatalf("expected empty File, got %+v", f)
	}
}

func TestReadFileNoDefaults(t *testing.T) {
	dir := t.TempDir()
	writeYAML(t, dir, `current_context: default
contexts:
  - name: default
    server: https://o.example.com
    org: default
    auth:
      scheme: basic
      username: a@b.com
`)
	f, ok, err := ReadFile(dir)
	if err != nil || !ok {
		t.Fatalf("ReadFile: ok=%v err=%v", ok, err)
	}
	if f.CurrentContext != "default" || len(f.Contexts) != 1 {
		t.Fatalf("unexpected file: %+v", f)
	}
	c := f.Contexts[0]
	if c.Name != "default" || c.BaseURL != "https://o.example.com" || c.Org != "default" ||
		c.Auth.Scheme != "basic" || c.Auth.Username != "a@b.com" {
		t.Fatalf("context mismatch: %+v", c)
	}
	if f.Defaults.Timeout != 0 || f.Defaults.MaxRetries != 0 {
		t.Fatalf("expected zero defaults, got %+v", f.Defaults)
	}
}

func TestWriteThenReadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	in := File{
		CurrentContext: "prod",
		Contexts: []NamedContext{
			{Name: "prod", BaseURL: "https://p", Org: "default", Auth: AuthConfig{Scheme: "basic", Username: "u@x"}},
			{Name: "stg", BaseURL: "https://s", Org: "dev", Auth: AuthConfig{Scheme: "token"}},
		},
		Defaults: Defaults{Timeout: 30 * time.Second, MaxRetries: 3},
	}
	if err := WriteFile(dir, in); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	out, ok, err := ReadFile(dir)
	if err != nil || !ok {
		t.Fatalf("ReadFile: ok=%v err=%v", ok, err)
	}
	if out.CurrentContext != "prod" || len(out.Contexts) != 2 {
		t.Fatalf("round-trip mismatch: %+v", out)
	}
	if out.Contexts[1].Auth.Scheme != "token" {
		t.Fatalf("scheme lost: %+v", out.Contexts[1])
	}
	if out.Defaults.Timeout != 30*time.Second || out.Defaults.MaxRetries != 3 {
		t.Fatalf("defaults lost: %+v", out.Defaults)
	}
}

func TestWriteFilePermissions(t *testing.T) {
	dir := t.TempDir()
	if err := WriteFile(dir, File{CurrentContext: "x", Contexts: []NamedContext{{Name: "x"}}}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(filepath.Join(dir, "config.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if perm := info.Mode().Perm(); perm != 0o600 {
		t.Fatalf("perm = %o, want 600", perm)
	}
}

func TestContextHelpers(t *testing.T) {
	f := File{Contexts: []NamedContext{{Name: "a"}, {Name: "b"}}}
	if _, ok := f.Context("A"); !ok {
		t.Fatal("Context should be case-insensitive")
	}
	f.Upsert(NamedContext{Name: "b", BaseURL: "https://new"})
	if c, _ := f.Context("b"); c.BaseURL != "https://new" {
		t.Fatalf("Upsert replace failed: %+v", c)
	}
	f.Upsert(NamedContext{Name: "c"})
	if len(f.Contexts) != 3 {
		t.Fatalf("Upsert append failed: %d", len(f.Contexts))
	}
	if names := f.ContextNames(); len(names) != 3 || names[0] != "a" {
		t.Fatalf("ContextNames: %v", names)
	}
	if !f.Remove("A") || len(f.Contexts) != 2 {
		t.Fatalf("Remove failed: %d", len(f.Contexts))
	}
	if f.Remove("nope") {
		t.Fatal("Remove of missing should return false")
	}
}
```

- [ ] **Step 3: Replace `internal/config/file.go` with an alias shim**

Replace the ENTIRE contents of `internal/config/file.go` with:

```go
package config

import (
	pkgcfg "github.com/angelmsger/openobserve-cli/pkg/config"
)

// The persistent config-file model moved to the public pkg/config so the
// desktop GUI can read/write the same file. These aliases keep the existing
// internal callers (loader.go, internal/app) compiling unchanged. The layered
// loader (flags/env/file) stays in this package.
type (
	File         = pkgcfg.File
	NamedContext = pkgcfg.NamedContext
	Defaults     = pkgcfg.Defaults
	AuthConfig   = pkgcfg.AuthConfig
)

func DefaultConfigDir() (string, error)     { return pkgcfg.DefaultConfigDir() }
func ResolveConfigDir() (string, error)     { return pkgcfg.ResolveConfigDir() }
func ConfigFilePath(dir string) string      { return pkgcfg.ConfigFilePath(dir) }
func ReadFile(dir string) (File, bool, error) { return pkgcfg.ReadFile(dir) }
func WriteFile(dir string, f File) error    { return pkgcfg.WriteFile(dir, f) }
```

Note: methods `Context`/`ContextNames`/`Upsert`/`Remove` travel with the aliased `File` type automatically. If `internal/config/config.go` previously defined `AuthConfig` or `Defaults` itself (a redeclaration conflict with these aliases), delete those duplicate definitions there and let the alias stand — the build error in Step 4 will pinpoint any such conflict; resolve by removing the now-duplicated internal definition.

- [ ] **Step 4: Build and test the CLI (must stay green)**

```bash
cd /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli
go build ./... && go test ./...
```
Expected: build succeeds; all tests PASS (including the new `pkg/config` tests and the existing `internal/app` config tests). If the build reports a duplicate `AuthConfig`/`Defaults`/`durationOr` or a missing `put`, resolve per the notes in Steps 1 and 3, then re-run.

- [ ] **Step 5: Commit (in the CLI repo)**

```bash
cd /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli
git add pkg/config/ internal/config/file.go
git commit -m "refactor: extract config-file model into public pkg/config

Move the persistent config-file schema, IO, path helpers, and context helpers
from internal/config into a public pkg/config so the desktop GUI can read/write
the same config.yaml. internal/config re-exports via type alias; the layered
loader stays internal. Adds a Remove context helper.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: o3 backend — context-aware bound methods over the shared config

This task replaces o3's separate JSON config store with the shared `pkg/config`, rewrites the connection bound methods to be context-aware, and regenerates bindings. The IO methods are manual-verified (no unit tests, per the milestone); a pure `contextInfos` mapping helper carries a unit test.

**Files (o3 repo):**
- Delete: `internal/config/config.go`, `internal/config/paths.go`, `internal/config/config_test.go`
- Keep unchanged: `internal/config/secret.go`
- Modify (replace bound-method section): `app.go`
- Create: `app_contexts_test.go`

**Interfaces:**
- Consumes: `cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"`, `pkgauth`, `api`, `internal/config` (secret funcs), `internal/query`, `internal/apperr`.
- Produces (bound, TS generated):
  - `type ContextInfo struct { Name, URL, Org, Scheme, Username string; HasSecret, IsCurrent bool }`
  - `type ConnConfig struct { Name, URL, Org, Scheme, Username, Secret string }`
  - `func (a *App) ListContexts() ([]ContextInfo, error)`
  - `func (a *App) SwitchContext(name string) error`
  - `func (a *App) SaveContext(c ConnConfig) error`
  - `func (a *App) RemoveContext(name string) error`
  - `func (a *App) TestConnection(c ConnConfig) (ConnInfo, error)`
  - unchanged: `ListStreams`, `GetFields`, `RunQuery`, `ConnInfo`, `StreamInfo`, `Field`

- [ ] **Step 1: Delete the old JSON config store**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git rm internal/config/config.go internal/config/paths.go internal/config/config_test.go
```
(`internal/config/secret.go` stays — it is the keychain store, still shared.)

- [ ] **Step 2: Write the failing test `app_contexts_test.go`** (pure mapping helper)

```go
package main

import (
	"testing"

	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"
)

func TestContextInfos(t *testing.T) {
	f := cfgshared.File{
		CurrentContext: "prod",
		Contexts: []cfgshared.NamedContext{
			{Name: "prod", BaseURL: "https://p", Org: "default", Auth: cfgshared.AuthConfig{Scheme: "basic", Username: "u@x"}},
			{Name: "stg", BaseURL: "https://s", Org: "dev", Auth: cfgshared.AuthConfig{}}, // empty scheme -> basic
		},
	}
	// hasSecret fake: only prod has a secret.
	has := func(url, scheme string) bool { return url == "https://p" && scheme == "basic" }

	got := contextInfos(f, has)
	if len(got) != 2 {
		t.Fatalf("want 2, got %d", len(got))
	}
	if got[0].Name != "prod" || !got[0].IsCurrent || !got[0].HasSecret || got[0].Scheme != "basic" {
		t.Fatalf("prod mapping wrong: %+v", got[0])
	}
	if got[0].URL != "https://p" || got[0].Org != "default" || got[0].Username != "u@x" {
		t.Fatalf("prod fields wrong: %+v", got[0])
	}
	if got[1].Name != "stg" || got[1].IsCurrent || got[1].HasSecret {
		t.Fatalf("stg mapping wrong: %+v", got[1])
	}
	if got[1].Scheme != "basic" { // empty scheme defaults to basic
		t.Fatalf("stg scheme should default to basic, got %q", got[1].Scheme)
	}
}
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test . -run TestContextInfos
```
Expected: FAIL — `undefined: contextInfos`, `undefined: ContextInfo` (and app.go still references the deleted `config.Load`/`Save`/`DataDir`, so the package won't compile yet — that is resolved in Step 4).

- [ ] **Step 4: Replace the connection section of `app.go`**

Replace the `App` struct's connection state, the `startup` body, the connection types (`ConnConfig`/`ConnInfo`), and ALL of the old `TestConnection`/`SaveConnection`/`LoadConnection`/`rebuildClient`/`requireClient`/`buildClient`/`credentialOf`/`orgOrDefault` with the version below. Keep the existing `ListStreams`/`GetFields`/`RunQuery`/`StreamInfo`/`Field`/`humanBytes` as they are (they call `a.requireClient()` and `client.DefaultOrg()`, both preserved below).

```go
package main

import (
	"context"
	"fmt"
	"sync"

	api "github.com/angelmsger/openobserve-cli/pkg/apiclient"
	pkgauth "github.com/angelmsger/openobserve-cli/pkg/auth"
	cfgshared "github.com/angelmsger/openobserve-cli/pkg/config"

	"github.com/angelmsger/openobserve-desktop/internal/apperr"
	"github.com/angelmsger/openobserve-desktop/internal/config"
	"github.com/angelmsger/openobserve-desktop/internal/query"
)

// App is the Wails-bound application. It owns a lazily-built client for the
// current context in the shared config.
type App struct {
	ctx context.Context

	mu     sync.Mutex
	client api.Client // nil until built for the current context
}

// NewApp creates a new App application struct.
func NewApp() *App {
	return &App{}
}

// startup records the Wails context and best-effort builds the client for the
// current context.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	_ = a.rebuildClient() // best-effort; data methods re-report if it fails
}

// ConnConfig is a connection's settings exchanged with the frontend. Secret is
// inbound only (Save/Test).
type ConnConfig struct {
	Name     string `json:"name"`
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

// ContextInfo describes one context for the switcher/manager. Secrets are never
// included; HasSecret reports keychain presence.
type ContextInfo struct {
	Name      string `json:"name"`
	URL       string `json:"url"`
	Org       string `json:"org"`
	Scheme    string `json:"scheme"`
	Username  string `json:"username"`
	HasSecret bool   `json:"hasSecret"`
	IsCurrent bool   `json:"isCurrent"`
}

func schemeOrBasic(s string) string {
	if s == "" {
		return pkgauth.SchemeBasic
	}
	return s
}

func orgOrDefault(org string) string {
	if org == "" {
		return "default"
	}
	return org
}

// configDir returns the shared config directory (~/.angelmsger/openobserve).
func configDir() (string, error) { return cfgshared.DefaultConfigDir() }

// contextInfos maps a config File to ContextInfo values; has reports whether a
// keychain secret exists for a (url, scheme). Pure, so it is unit-tested.
func contextInfos(f cfgshared.File, has func(url, scheme string) bool) []ContextInfo {
	out := make([]ContextInfo, 0, len(f.Contexts))
	for _, c := range f.Contexts {
		scheme := schemeOrBasic(c.Auth.Scheme)
		out = append(out, ContextInfo{
			Name:      c.Name,
			URL:       c.BaseURL,
			Org:       c.Org,
			Scheme:    scheme,
			Username:  c.Auth.Username,
			HasSecret: has(c.BaseURL, scheme),
			IsCurrent: c.Name == f.CurrentContext,
		})
	}
	return out
}

// buildClient assembles an authenticated client for a context with a secret.
func buildClient(url, org, scheme, username, secret string, def cfgshared.Defaults) (api.Client, error) {
	cred := pkgauth.Credential{Scheme: schemeOrBasic(scheme), Username: username, Secret: secret}
	if err := cred.Validate(); err != nil {
		return nil, err
	}
	return api.Build(api.BuildParams{
		BaseURL:       url,
		Org:           orgOrDefault(org),
		AuthDecorator: cred.Decorator(),
		Timeout:       def.Timeout,
		MaxRetries:    def.MaxRetries,
	})
}

// rebuildClient rebuilds a.client from the current context plus its keychain
// secret. Returns a not-configured error when there is no current context or
// no stored secret.
func (a *App) rebuildClient() error {
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok || len(f.Contexts) == 0 {
		return apperr.NotConfigured("no contexts configured")
	}
	cur, ok := f.Context(f.CurrentContext)
	if !ok {
		cur = f.Contexts[0]
	}
	scheme := schemeOrBasic(cur.Auth.Scheme)
	secret, has, err := config.LoadSecret(cur.BaseURL, scheme)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !has {
		return apperr.NotConfigured("no stored credential for the current context")
	}
	client, err := buildClient(cur.BaseURL, cur.Org, scheme, cur.Auth.Username, secret, f.Defaults)
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

// ListContexts returns every context in the shared config, with keychain
// presence and which is current.
func (a *App) ListContexts() ([]ContextInfo, error) {
	dir, err := configDir()
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return nil, apperr.Wrap(err)
	}
	if !ok {
		return []ContextInfo{}, nil
	}
	has := func(url, scheme string) bool {
		_, present, _ := config.LoadSecret(url, scheme)
		return present
	}
	return contextInfos(f, has), nil
}

// SwitchContext sets the current context and rebuilds the client.
func (a *App) SwitchContext(name string) error {
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok {
		return apperr.NotConfigured("no contexts configured")
	}
	if _, found := f.Context(name); !found {
		return apperr.Wrap(fmt.Errorf("unknown context %q", name))
	}
	f.CurrentContext = name
	if err := cfgshared.WriteFile(dir, f); err != nil {
		return apperr.Wrap(err)
	}
	a.mu.Lock()
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// SaveContext upserts a context into the shared config (and its secret into the
// keychain when provided), then rebuilds the client if the saved context is
// current.
func (a *App) SaveContext(c ConnConfig) error {
	if c.Name == "" || c.URL == "" {
		return apperr.Wrap(fmt.Errorf("context name and URL are required"))
	}
	scheme := schemeOrBasic(c.Scheme)
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, _, err := cfgshared.ReadFile(dir) // missing file -> empty File, ok ignored
	if err != nil {
		return apperr.Wrap(err)
	}
	f.Upsert(cfgshared.NamedContext{
		Name:    c.Name,
		BaseURL: c.URL,
		Org:     orgOrDefault(c.Org),
		Auth:    cfgshared.AuthConfig{Scheme: scheme, Username: c.Username},
	})
	if f.CurrentContext == "" {
		f.CurrentContext = c.Name // first context becomes current
	}
	if err := cfgshared.WriteFile(dir, f); err != nil {
		return apperr.Wrap(err)
	}
	if c.Secret != "" {
		if err := config.SaveSecret(c.URL, scheme, c.Secret); err != nil {
			return apperr.Wrap(err)
		}
	}
	if c.Name == f.CurrentContext {
		a.mu.Lock()
		a.client = nil
		a.mu.Unlock()
		return apperr.Wrap(a.rebuildClient())
	}
	return nil
}

// RemoveContext deletes a context (and its keychain secret). It refuses to
// remove the last context.
func (a *App) RemoveContext(name string) error {
	dir, err := configDir()
	if err != nil {
		return apperr.Wrap(err)
	}
	f, ok, err := cfgshared.ReadFile(dir)
	if err != nil {
		return apperr.Wrap(err)
	}
	if !ok || len(f.Contexts) <= 1 {
		return apperr.Wrap(fmt.Errorf("cannot remove the last context"))
	}
	ctx, found := f.Context(name)
	if !found {
		return apperr.Wrap(fmt.Errorf("unknown context %q", name))
	}
	f.Remove(name)
	if f.CurrentContext == name && len(f.Contexts) > 0 {
		f.CurrentContext = f.Contexts[0].Name
	}
	if err := cfgshared.WriteFile(dir, f); err != nil {
		return apperr.Wrap(err)
	}
	_ = config.DeleteSecret(ctx.BaseURL, schemeOrBasic(ctx.Auth.Scheme))
	a.mu.Lock()
	a.client = nil
	a.mu.Unlock()
	return apperr.Wrap(a.rebuildClient())
}

// TestConnection verifies a connection without persisting it. When Secret is
// empty it falls back to the stored keychain secret, so Test works on an
// existing context the user did not re-type.
func (a *App) TestConnection(c ConnConfig) (ConnInfo, error) {
	scheme := schemeOrBasic(c.Scheme)
	secret := c.Secret
	if secret == "" {
		if stored, has, _ := config.LoadSecret(c.URL, scheme); has {
			secret = stored
		}
	}
	client, err := buildClient(c.URL, c.Org, scheme, c.Username, secret, cfgshared.Defaults{})
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
```

Note: confirm the retained `ListStreams`/`GetFields`/`RunQuery`/`humanBytes` below this section are unchanged and still compile against `a.requireClient()` and `client.DefaultOrg()` (both preserved above). Remove any leftover references to the deleted `LoadConnection`/`SaveConnection`/`config.DataDir`/`config.Load`/`config.Save`.

- [ ] **Step 5: Run the unit test + build**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go test . -run TestContextInfos && go build ./...
```
Expected: `TestContextInfos` PASS; `go build ./...` clean. If the build still references a deleted symbol, remove that reference.

- [ ] **Step 6: Regenerate the Wails bindings**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails generate module
```
Confirm `frontend/wailsjs/go/main/App.d.ts` lists `ListContexts`, `SwitchContext`, `SaveContext`, `RemoveContext`, `TestConnection` (and no longer `LoadConnection`/`SaveConnection`), and `frontend/wailsjs/go/models.ts` has `main.ContextInfo`. If `wails generate` flips `frontend/wailsjs/runtime/*` mode bits, `chmod 644` them back or stage only `frontend/wailsjs/go/`.

- [ ] **Step 7: Verify sibling clean + commit**

```bash
git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain   # expect empty
cd /Users/angelmsger/Development/Workspaces/o3
git add app.go app_contexts_test.go internal/config/ frontend/wailsjs/go/
git commit -m "feat: context-aware backend over the shared openobserve config

Replace o3's separate JSON config store with the CLI's pkg/config so o3 reads
and writes the shared config.yaml. Add ListContexts/SwitchContext/SaveContext/
RemoveContext and make the client build from the current context plus its
keychain secret. TestConnection falls back to the stored secret.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: o3 frontend — contexts state, startup load, title-bar switcher, multi-context wizard

This task delivers the "configure once → connect → switch" loop. The gate is a clean `wails build`; the live run is a separate manual step.

**Files (o3 repo):**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/TitleBar.tsx` (+ its `.module.css`)
- Modify: `frontend/src/components/SetupWizard.tsx` (+ its `.module.css`)
- Reference (read for fidelity): `design/Observe.dc.html` — title-bar switcher lines 58-85; wizard lines 645-667; state/handlers lines 893-900, 1096-1116, 1353-1417.

**Interfaces:**
- Consumes bindings `import { ListContexts, SwitchContext, SaveContext, TestConnection } from '../wailsjs/go/main/App'`. `ContextInfo = {name,url,org,scheme,username,hasSecret,isCurrent}`; `ConnConfig` arg = `{name,url,org,scheme,username,secret}`.
- Produces: `App.tsx` contexts state + handlers consumed by Task 4's settings manager.

- [ ] **Step 1: Add contexts state + types to `App.tsx`**

Add near the existing state. The frontend keeps a UI-enriched context (palette color + draft secret fields the user types):

```tsx
import { ListContexts, SwitchContext, SaveContext, TestConnection } from '../wailsjs/go/main/App';

// one context as the UI holds it (color is UI-only; password/token are drafts)
interface UICtx {
  name: string; url: string; org: string;
  scheme: string;        // 'basic' | 'token'
  username: string;      // email
  hasSecret: boolean; isCurrent: boolean;
  color: string;
  password: string; token: string;  // draft-only, never read back from backend
  draft: boolean;        // true until first successful SaveContext
}

const CTX_PALETTE = ['#34e0a1', '#f5b340', '#7c83ff', '#2dd4bf', '#60a5fa', '#f4685f'];

const [contexts, setContexts] = useState<UICtx[]>([]);
const [currentName, setCurrentName] = useState<string>('');
```

Add a mapper from binding `ContextInfo[]` to `UICtx[]` (assign colors by index, blank draft secrets):

```tsx
const toUICtx = (infos: { name: string; url: string; org: string; scheme: string; username: string; hasSecret: boolean; isCurrent: boolean }[]): UICtx[] =>
  infos.map((c, i) => ({
    name: c.name, url: c.url, org: c.org, scheme: c.scheme, username: c.username,
    hasSecret: c.hasSecret, isCurrent: c.isCurrent,
    color: CTX_PALETTE[i % CTX_PALETTE.length],
    password: '', token: '', draft: false,
  }));
```

- [ ] **Step 2: Load contexts on startup; open wizard only when none usable**

Replace the M2 `LoadConnection` startup effect with a contexts load. "Usable" = a current context that `hasSecret`.

```tsx
const refreshContexts = async (): Promise<UICtx[]> => {
  const infos = await ListContexts();
  const ui = toUICtx(infos as any);
  setContexts(ui);
  const cur = ui.find((c) => c.isCurrent) ?? ui[0];
  setCurrentName(cur?.name ?? '');
  return ui;
};

useEffect(() => {
  refreshContexts()
    .then((ui) => {
      const cur = ui.find((c) => c.isCurrent) ?? ui[0];
      if (!cur || !cur.hasSecret) {
        setConfigured(false);
        setSetupOpen(true);
        return;
      }
      setConfigured(true);
      return ListStreams()
        .then((s) => {
          const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
          setLiveStreams(mapped);
          if (mapped.length > 0) setStream(mapped[0].name);
        })
        .catch((e) => {
          if (parseAppError(e).category === 'not_configured') { setConfigured(false); setSetupOpen(true); }
        });
    })
    .catch(() => { setConfigured(false); setSetupOpen(true); });
}, []);
```

- [ ] **Step 3: Switch / add / save handlers in `App.tsx`**

```tsx
const handleSwitchContext = async (name: string) => {
  try {
    await SwitchContext(name);
    setCurrentName(name);
    await refreshContexts();
    setConfigured(true);
    setQueryError(null);
    setLiveRows([]); setLiveBars([]);
    const s = await ListStreams().catch((e) => {
      if (parseAppError(e).category === 'not_configured') { setConfigured(false); setSetupOpen(true); }
      return [];
    });
    const mapped = withColors(s.map((x) => ({ name: x.name, size: x.size })));
    setLiveStreams(mapped);
    if (mapped.length > 0) setStream(mapped[0].name);
  } catch (e: any) {
    setWizardError(parseAppError(e).message);
  }
};

// add a draft context (held in state until SaveContext persists it)
const handleAddContext = () => {
  const color = CTX_PALETTE[contexts.length % CTX_PALETTE.length];
  const draft: UICtx = {
    name: 'new-context', url: '', org: 'default', scheme: 'basic', username: '',
    hasSecret: false, isCurrent: false, color, password: '', token: '', draft: true,
  };
  setContexts((cs) => [...cs, draft]);
  setCurrentName('new-context');
};

// persist the named context (upsert + secret), then refresh
const handleSaveContext = async (ctx: UICtx): Promise<void> => {
  const secret = ctx.scheme === 'token' ? ctx.token : ctx.password;
  await SaveContext({ name: ctx.name, url: ctx.url, org: ctx.org, scheme: ctx.scheme, username: ctx.username, secret } as any);
  setConfigured(true);
  await refreshContexts();
};

const handleTestContext = async (ctx: UICtx): Promise<void> => {
  setWizardError(null);
  try {
    const secret = ctx.scheme === 'token' ? ctx.token : ctx.password;
    await TestConnection({ name: ctx.name, url: ctx.url, org: ctx.org, scheme: ctx.scheme, username: ctx.username, secret } as any);
    setTested(true);
  } catch (e: any) {
    setTested(false);
    setWizardError(parseAppError(e).message);
  }
};
```

- [ ] **Step 4: Title-bar context switcher (`TitleBar.tsx`)**

Add a switcher button + dropdown to the title bar, faithful to `design/Observe.dc.html` lines 58-85. Read those lines for exact markup, classes, colors, and the `--accent` usage. Wire:
- The button shows the active context's color dot + name; clicking toggles the dropdown.
- The dropdown lists every context (color dot + name, active highlighted); clicking one calls `onSwitch(name)`.
- "+ Add context" calls `onAddContext()`; "Manage…" calls `onManage()`.

Props to add to `TitleBar`:
```tsx
interface TitleBarContextSwitch {
  contexts: { name: string; color: string; isCurrent: boolean }[];
  currentName: string;
  switchOpen: boolean;
  onToggleSwitch: () => void;
  onSwitch: (name: string) => void;
  onAddContext: () => void;
  onManage: () => void;
}
```
Use the established motion tokens (`ooFade` for the dropdown, the existing reduced-motion handling). Preserve the native-traffic-light layout from M1 (the switcher sits to the right of the lights, in the draggable bar; mark the button/dropdown `.oo-no-drag`).

In `App.tsx`, add `const [ctxSwitchOpen, setCtxSwitchOpen] = useState(false);` and pass:
```tsx
contexts={contexts.map((c) => ({ name: c.name, color: c.color, isCurrent: c.name === currentName }))}
currentName={currentName}
switchOpen={ctxSwitchOpen}
onToggleSwitch={() => setCtxSwitchOpen((v) => !v)}
onSwitch={(name) => { setCtxSwitchOpen(false); handleSwitchContext(name); }}
onAddContext={() => { setCtxSwitchOpen(false); handleAddContext(); setSettingsOpen(true); setSettingsTab('connection'); }}
onManage={() => { setCtxSwitchOpen(false); setSettingsOpen(true); setSettingsTab('connection'); }}
```

- [ ] **Step 5: Multi-context setup wizard (`SetupWizard.tsx`)**

Convert the wizard to list contexts + add/name them, faithful to `design/Observe.dc.html` lines 645-667. Read those lines for markup. The wizard:
- Shows "Your contexts" (the `contexts` list with color dot + name; the active/draft one selected).
- "+ New context" calls `onAddContext()`.
- A context-name field + the existing url/org/auth/email/secret fields edit the SELECTED context (update `contexts` state in place).
- "Test" calls `handleTestContext(selected)`; the primary/confirm button calls `handleSaveContext(selected)` then closes when it succeeds and a stream load works.

Wire the existing wizard field handlers to mutate the selected `UICtx` in `contexts` (by name) instead of the old single `conn`. Keep `wizardError` rendering from M2 (the `.testError` line).

- [ ] **Step 6: Build (the gate)**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: TypeScript compiles cleanly; bundle produced. (Build-only; live run deferred to the user.)

- [ ] **Step 7: Verify sibling clean + commit**

```bash
git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain   # expect empty
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/App.tsx frontend/src/components/TitleBar.tsx frontend/src/components/TitleBar.module.css frontend/src/components/SetupWizard.tsx frontend/src/components/SetupWizard.module.css
git commit -m "feat: title-bar context switcher + multi-context setup wizard

Load contexts from the shared config on startup, connect to the current
context, switch between contexts from the title bar, and configure/add
contexts via the wizard.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: o3 frontend — Settings Contexts manager (CRUD + edit active context)

This task adds the kubectl-style contexts manager to Settings → Connection: add/list/use/delete contexts and an "Edit active context" form. Gate: clean `wails build`.

**Files (o3 repo):**
- Modify: `frontend/src/components/SettingsModal.tsx` (+ its `.module.css`)
- Modify: `frontend/src/App.tsx` (wire the manager + a `RemoveContext` handler)
- Reference: `design/Observe.dc.html` — contexts manager + edit-active form lines 438-477; the row/menu derivations lines 1353-1373.

**Interfaces:**
- Consumes: `import { RemoveContext } from '../wailsjs/go/main/App'` plus the Task 3 handlers (`handleSwitchContext`, `handleSaveContext`, `handleTestContext`, `handleAddContext`) and `contexts`/`currentName` state.
- Produces: full context CRUD from Settings.

- [ ] **Step 1: Add a `RemoveContext` handler in `App.tsx`**

```tsx
import { RemoveContext } from '../wailsjs/go/main/App';

const handleRemoveContext = async (name: string) => {
  try {
    await RemoveContext(name); // backend deletes, sets a new current, rebuilds the client
    const ui = await refreshContexts();
    const cur = ui.find((c) => c.isCurrent) ?? ui[0];
    if (cur) await handleSwitchContext(cur.name); // reload streams for the new current
  } catch (e: any) {
    setWizardError(parseAppError(e).message);
  }
};
```
(If `RemoveContext` rejects because it is the last context, the backend returns an error and the list is unchanged — surface `parseAppError(e).message`.)

- [ ] **Step 2: Contexts manager in `SettingsModal.tsx` (Connection tab)**

Add the manager + "Edit active context" form to the Connection tab, faithful to `design/Observe.dc.html` lines 438-477. Read those lines for markup, classes, and colors. The manager:
- Header "Contexts" + subtext "switch the active instance any time" + "+ Add context" (calls `onAddContext`).
- A row per context: color dot + name, an active marker, a "Use" action (`onUse(name)` → switch), and a delete "✕" (`onRemove(name)`) shown only when there is more than one context.
- "Edit active context": a Context-name field + the url/org/auth/email/secret fields bound to the selected/active context; a "Test" button (`onTest`) and a "Save" button (`onSave`).

Props to add to `SettingsModal`:
```tsx
interface SettingsContextsProps {
  contexts: { name: string; color: string; isCurrent: boolean }[];
  active: { name: string; url: string; org: string; scheme: string; username: string; password: string; token: string } | null;
  canRemove: boolean;
  onAddContext: () => void;
  onUse: (name: string) => void;
  onRemove: (name: string) => void;
  onField: (key: string, value: string) => void;  // edits the active context in App state
  onTest: () => void;
  onSave: () => void;
}
```

In `App.tsx`, wire:
```tsx
contexts={contexts.map((c) => ({ name: c.name, color: c.color, isCurrent: c.name === currentName }))}
active={(() => { const a = contexts.find((c) => c.name === currentName); return a ? { name: a.name, url: a.url, org: a.org, scheme: a.scheme, username: a.username, password: a.password, token: a.token } : null; })()}
canRemove={contexts.length > 1}
onAddContext={handleAddContext}
onUse={(name) => handleSwitchContext(name)}
onRemove={(name) => handleRemoveContext(name)}
onField={(key, value) => setContexts((cs) => cs.map((c) => (c.name === currentName ? { ...c, [key]: value } : c)))}
onTest={() => { const a = contexts.find((c) => c.name === currentName); if (a) handleTestContext(a); }}
onSave={() => { const a = contexts.find((c) => c.name === currentName); if (a) handleSaveContext(a); }}
```
Note: when `onField` renames the active context, the rename takes effect on `onSave` (which upserts by the new name). Editing the name then immediately switching is out of scope; the form edits the in-state context and `Save` persists it.

- [ ] **Step 3: Build (the gate)**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
```
Expected: TypeScript compiles cleanly; bundle produced.

- [ ] **Step 4: Verify sibling clean + commit**

```bash
git -C /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli status --porcelain   # expect empty
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/components/SettingsModal.tsx frontend/src/components/SettingsModal.module.css frontend/src/App.tsx
git commit -m "feat: Settings contexts manager (add/use/delete + edit active context)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Manual live verification (developer-run)**

Run `wails dev` against the real instance (the user's `config.yaml` with `default` + `test`):
- Launch with the existing CLI config → o3 connects to `default` with no wizard (the gap reported earlier is closed).
- Title-bar switcher lists `default` + `test`; switching to `test` reloads streams for that server.
- Settings → Connection shows both contexts; "Use" switches; "✕" deletes a non-current context (blocked on the last).
- Add a context via the wizard / "+ Add context" → it appears in the CLI's `config.yaml` (`cat ~/.angelmsger/openobserve/config.yaml`) and the CLI sees it (`openobserve-cli config ...`).
- Editing a context's name/org without re-typing the password preserves the keychain credential (Test still succeeds).

---

## Self-Review

**1. Spec coverage** (against `docs/superpowers/specs/2026-06-26-openobserve-desktop-shared-config-contexts-design.md`):
- §3 `pkg/config` extraction (File schema + IO + paths + Context/Upsert/Remove; optional defaults) → Task 1. ✓
- §4 module wiring (import `pkg/config`, no `go work sync`) → Task 2 + Global Constraints. ✓
- §5 delete JSON store / keep secret.go → Task 2 Step 1. ✓
- §5 bound methods (ListContexts/SwitchContext/SaveContext/RemoveContext/TestConnection; ConnConfig gains Name; ContextInfo) → Task 2. ✓
- §5 secret rules (never send secret to FE; SaveContext writes secret only if non-empty; TestConnection fallback; incomplete contexts not persisted) → Task 2 (SaveContext/TestConnection) + Task 3 (draft held in state). ✓
- §6 field mapping (password↔basic, token↔token, email↔username, url↔server; color/selfSigned UI-only) → Task 2 (`schemeOrBasic`, mapping) + Task 3/4 (UI palette). ✓
- §7 three UI surfaces (title-bar switcher, settings manager, wizard) → Tasks 3-4 with design line refs. ✓
- §8 error handling (apperr/parseAppError, not_configured opens wizard) → Tasks 2-4. ✓
- §9 testing (pkg/config table tests; o3 pure mapping test; context methods build+manual) → Task 1 Step 2, Task 2 Step 2, Tasks 3-4 build gates + Task 4 Step 5 manual. ✓
- §10 risks (sibling dirtying, last-writer-wins, remove deletes shared secret) → Global Constraints + Task 2 RemoveContext + Task 4 manual. ✓
- Non-goals (selfSigned wiring, color persistence, file fallback, flag/env layering, migration, read_only/format) → none implemented. ✓

**2. Placeholder scan:** No "TBD"/"TODO"/"handle edge cases"/"similar to Task N". The frontend Steps 4-5 (Task 3) and Step 2 (Task 4) reference `design/Observe.dc.html` line ranges for exact markup rather than reproducing ~150 lines of design HTML — this is the established M1/M2 pattern for design-driven UI, and each gives the precise binding contract, props, and handler wiring (the logic, not the pixels). Bounded, not blank.

**3. Type consistency:** `cfgshared.File`/`NamedContext`/`AuthConfig`/`Defaults` (Task 1) are consumed unchanged in Task 2 (`ReadFile`/`WriteFile`/`Upsert`/`Remove`/`Context`). `ContextInfo{Name,URL,Org,Scheme,Username,HasSecret,IsCurrent}` and `ConnConfig{Name,URL,Org,Scheme,Username,Secret}` (Task 2) match the frontend `UICtx` mapping and the binding calls in Tasks 3-4 (json tags `name/url/org/scheme/username/hasSecret/isCurrent` and `secret`). `contextInfos(File, func(string,string) bool)` defined and tested in Task 2 matches its use in `ListContexts`. Handlers `handleSwitchContext`/`handleSaveContext`/`handleTestContext`/`handleAddContext`/`handleRemoveContext` defined in Task 3/4 Step 1 are referenced consistently in Tasks 3-4 wiring. `refreshContexts`/`toUICtx`/`CTX_PALETTE`/`contexts`/`currentName` are defined in Task 3 Step 1-2 and reused in Task 4. Consistent. ✓
