# AI Ecosystem Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace o3's non-functional MCP placeholder with a working "AI Ecosystem" Settings tab (plus a nav-rail shortcut) that detects, installs, upgrades, and uninstalls [openobserve-cli](https://github.com/AngelMsger/openobserve-cli) and its companion Skill.

**Architecture:** A new Go package `internal/ecosystem` does all detection and management through an injected `Runner` (so it is unit-testable without shelling out): it resolves the login-shell PATH, runs `npm`/`openobserve-cli`, and queries the npm registry for the latest version. `app.go` exposes six Wails-bound methods over an `*ecosystem.Service`. The frontend replaces the MCP panel with an `AIEcosystem` component driven by pure logic in `lib/ecosystem.ts`, and adds a `>_` nav-rail shortcut with a three-state status dot.

**Tech Stack:** Go 1.24 (`os/exec`, `net/http`, `encoding/json`), Wails v2 bindings, React 18 + TypeScript + Vite, vitest.

## Global Constraints

- **Platform:** macOS only in practice; backend is plain `os/exec` (no cgo, no build-tag split).
- **CLI management = npm.** Install `npm install -g @angelmsger/openobserve-cli`; Upgrade `npm install -g @angelmsger/openobserve-cli@latest`; Uninstall `npm uninstall -g @angelmsger/openobserve-cli`. npm absent -> UI shows copy-command + docs, never calls the backend.
- **Provenance-aware.** `npm ls -g` decides `managed = "npm" | "external"`. Upgrade/Uninstall only run for `npm`; external defers to docs.
- **Skill management = shell out to the CLI.** Actions: `openobserve-cli skill install` / `skill uninstall`. Detection: `openobserve-cli skill status --format json` with env `OPENOBSERVE_CLI_SKILL=1`. Never touch skill files directly.
- **Update detection via npm registry** `https://registry.npmjs.org/@angelmsger/openobserve-cli`, field `dist-tags.latest`; any failure degrades silently to no update prompt (~3s timeout).
- **No `sudo`.** Permission failures surface as the trimmed stderr + the manual command.
- **Fixed commands only** — no user input is ever interpolated into an argument vector.
- **No oa-cli changes.** This feature only consumes the CLI's existing surface.
- After `wails generate`/`wails build`/`go build`, keep intended binding diffs but restore mode-bit churn: `git checkout -- frontend/wailsjs/runtime/ go.mod go.sum`. Never run `go work sync`.
- ASCII half-width punctuation in comments/commits; PascalCase brand terms (Skill, Agent, CLI); accent is the CSS var `--accent` (default `#2dd4bf`), status dot uses a fixed green `#34e0a1`.
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Do not push without the user asking.

**Canonical constants (use verbatim):**
- npm package: `@angelmsger/openobserve-cli`
- CLI binary: `openobserve-cli`
- registry URL: `https://registry.npmjs.org/@angelmsger/openobserve-cli`

---

## File Structure

**Backend (Go, o3):**
- `internal/ecosystem/parse.go` — pure parsers: CLI version, semver compare, `npm ls` provenance, `skill status` payload.
- `internal/ecosystem/runner.go` — `Runner` interface, real `execRunner`, login-shell PATH resolution (`mergePATH` pure helper).
- `internal/ecosystem/registry.go` — `fetchLatest` (npm registry `dist-tags.latest`).
- `internal/ecosystem/ecosystem.go` — types `EcoStatus`/`CLIStatus`/`SkillStatus`, `Service`, `Status`, and the five action methods.
- Tests: `parse_test.go`, `runner_test.go`, `registry_test.go`, `ecosystem_test.go`, `integration_test.go`.
- `app.go` — hold `*ecosystem.Service`; add six bound methods.

**Frontend:**
- `frontend/src/lib/ecosystem.ts` (+ `ecosystem.test.ts`) — pure status-derivation logic + shared TS types.
- `frontend/src/components/AIEcosystem.tsx` (+ `AIEcosystem.module.css`) — the two cards.
- `frontend/src/components/SettingsModal.tsx` — swap MCP panel for `<AIEcosystem>`, rename tab, swap props.
- `frontend/src/components/NavRail.tsx` (+ `NavRail.module.css`) — `>_` shortcut + status dot.
- `frontend/src/App.tsx` — ecosystem state/handlers; wire NavRail + SettingsModal; remove `mcpOn`.
- Regenerated bindings: `frontend/wailsjs/go/main/App.{d.ts,js}` + `frontend/wailsjs/go/models.ts`.

**Shared type shapes (Go json tag -> TS field):**
```
EcoStatus  { npmAvailable bool; cli CLIStatus; skill SkillStatus }
CLIStatus  { installed bool; version string; path string; managed string("npm"|"external"|""); latestVersion string; updateAvailable bool }
SkillStatus{ installed bool; version string; agents []string }
```

---

## Task 1: Pure parsers + semver (Go)

**Files:**
- Create: `internal/ecosystem/parse.go`
- Test: `internal/ecosystem/parse_test.go`

**Interfaces:**
- Produces: `parseCLIVersion(out string) string`, `compareSemver(a, b string) int`, `parseNpmManaged(jsonOut string) bool`, `parseSkillStatus(jsonOut string) (installed bool, agents []string, version string)`.

- [ ] **Step 1: Write the failing test**

Create `internal/ecosystem/parse_test.go`:

```go
package ecosystem

import (
	"reflect"
	"testing"
)

func TestParseCLIVersion(t *testing.T) {
	cases := map[string]string{
		"openobserve-cli v0.5.0 (commit abc1234, built 2025-06-29T15:12:00Z)": "0.5.0",
		"openobserve-cli v1.10.2\n":                                           "1.10.2",
		"garbage output":                                                      "",
		"":                                                                    "",
	}
	for in, want := range cases {
		if got := parseCLIVersion(in); got != want {
			t.Errorf("parseCLIVersion(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestCompareSemver(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"0.5.0", "0.5.0", 0},
		{"0.6.0", "0.5.0", 1},
		{"0.5.0", "0.6.0", -1},
		{"1.0.0", "0.9.9", 1},
		{"0.5.10", "0.5.2", 1},
	}
	for _, c := range cases {
		if got := compareSemver(c.a, c.b); got != c.want {
			t.Errorf("compareSemver(%q,%q) = %d, want %d", c.a, c.b, got, c.want)
		}
	}
}

func TestParseNpmManaged(t *testing.T) {
	managed := `{"dependencies":{"@angelmsger/openobserve-cli":{"version":"0.5.0"}}}`
	if !parseNpmManaged(managed) {
		t.Error("expected managed=true when package present in dependencies")
	}
	notManaged := `{"dependencies":{"typescript":{"version":"5.0.0"}}}`
	if parseNpmManaged(notManaged) {
		t.Error("expected managed=false when package absent")
	}
	if parseNpmManaged("not json") {
		t.Error("expected managed=false on malformed json")
	}
}

func TestParseSkillStatus(t *testing.T) {
	payload := `{"embedded_version":"0.2.0","installs":[
		{"agent":"claude-code","path":"/h/.claude/skills/openobserve","status":"installed"},
		{"agent":"codex","path":"/h/.codex/skills/openobserve","status":"not_installed"}]}`
	installed, agents, version := parseSkillStatus(payload)
	if !installed {
		t.Error("expected installed=true")
	}
	if !reflect.DeepEqual(agents, []string{"claude-code"}) {
		t.Errorf("agents = %v, want [claude-code]", agents)
	}
	if version != "0.2.0" {
		t.Errorf("version = %q, want 0.2.0", version)
	}
	// none installed
	none := `{"embedded_version":"0.2.0","installs":[{"agent":"codex","path":"/x","status":"not_installed"}]}`
	if in, ag, _ := parseSkillStatus(none); in || len(ag) != 0 {
		t.Errorf("expected not installed, got installed=%v agents=%v", in, ag)
	}
	// malformed
	if in, _, _ := parseSkillStatus("nope"); in {
		t.Error("expected installed=false on malformed json")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run 'Parse|Compare' -v`
Expected: FAIL — `undefined: parseCLIVersion` (package does not compile).

- [ ] **Step 3: Write minimal implementation**

Create `internal/ecosystem/parse.go`:

```go
// Package ecosystem detects and manages the sibling openobserve-cli and its
// companion Skill on behalf of the o3 GUI. All parsing is pure and unit-tested;
// side-effecting command execution goes through the Runner interface.
package ecosystem

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
)

// pkgName is the npm package that ships the CLI.
const pkgName = "@angelmsger/openobserve-cli"

var versionRE = regexp.MustCompile(`v(\d+\.\d+\.\d+)`)

// parseCLIVersion extracts the semver from `openobserve-cli version` output
// (e.g. "openobserve-cli v0.5.0 (commit ...)"). Returns "" when absent.
func parseCLIVersion(out string) string {
	m := versionRE.FindStringSubmatch(out)
	if m == nil {
		return ""
	}
	return m[1]
}

// compareSemver returns -1, 0, or 1 comparing two "x.y.z" strings numerically.
// Non-numeric or missing parts compare as 0.
func compareSemver(a, b string) int {
	pa, pb := strings.Split(a, "."), strings.Split(b, ".")
	for i := 0; i < 3; i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	return 0
}

// parseNpmManaged reports whether `npm ls -g --json <pkg>` output shows the
// package installed (present under "dependencies"). npm exits non-zero when the
// package is absent but still prints JSON, so callers must ignore the exit code.
func parseNpmManaged(jsonOut string) bool {
	var v struct {
		Dependencies map[string]json.RawMessage `json:"dependencies"`
	}
	if err := json.Unmarshal([]byte(jsonOut), &v); err != nil {
		return false
	}
	_, ok := v.Dependencies[pkgName]
	return ok
}

// parseSkillStatus reads `openobserve-cli skill status --format json` output and
// returns whether the Skill is installed for any agent, the list of agent ids it
// is installed for, and the CLI's embedded Skill version.
func parseSkillStatus(jsonOut string) (installed bool, agents []string, version string) {
	var v struct {
		EmbeddedVersion string `json:"embedded_version"`
		Installs        []struct {
			Agent  string `json:"agent"`
			Status string `json:"status"`
		} `json:"installs"`
	}
	if err := json.Unmarshal([]byte(jsonOut), &v); err != nil {
		return false, nil, ""
	}
	agents = []string{}
	for _, in := range v.Installs {
		if in.Status == "installed" {
			agents = append(agents, in.Agent)
		}
	}
	return len(agents) > 0, agents, v.EmbeddedVersion
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run 'Parse|Compare' -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/ecosystem/parse.go internal/ecosystem/parse_test.go
git commit -m "feat(ecosystem): pure CLI/skill/npm parsers + semver

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Runner interface + PATH resolution (Go)

**Files:**
- Create: `internal/ecosystem/runner.go`
- Test: `internal/ecosystem/runner_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Runner interface { Run(ctx context.Context, name string, args ...string) (stdout, stderr string, err error); LookPath(name string) (string, bool) }`; `mergePATH(shellPATH string, extra []string) string`; `newExecRunner() *execRunner` (real implementation resolving PATH once).

- [ ] **Step 1: Write the failing test**

Create `internal/ecosystem/runner_test.go`:

```go
package ecosystem

import (
	"strings"
	"testing"
)

func TestMergePATH(t *testing.T) {
	// shell PATH wins order; extras appended; duplicates and empties dropped.
	got := mergePATH("/usr/bin:/bin", []string{"/opt/homebrew/bin", "/bin", "", "/usr/local/bin"})
	parts := strings.Split(got, ":")
	want := []string{"/usr/bin", "/bin", "/opt/homebrew/bin", "/usr/local/bin"}
	if len(parts) != len(want) {
		t.Fatalf("got %v, want %v", parts, want)
	}
	for i := range want {
		if parts[i] != want[i] {
			t.Fatalf("got %v, want %v", parts, want)
		}
	}
}

func TestMergePATHEmptyShell(t *testing.T) {
	got := mergePATH("", []string{"/opt/homebrew/bin", "/usr/local/bin"})
	if got != "/opt/homebrew/bin:/usr/local/bin" {
		t.Fatalf("got %q", got)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run MergePATH -v`
Expected: FAIL — `undefined: mergePATH`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/ecosystem/runner.go`:

```go
package ecosystem

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Runner runs fixed commands with a resolved PATH. It is injected so tests never
// shell out.
type Runner interface {
	// Run executes name+args and returns stdout, stderr, and any error. A
	// non-zero exit is returned as err with stderr populated; callers that need
	// the stdout of a non-zero exit (e.g. `npm ls` when a package is missing)
	// read stdout regardless of err.
	Run(ctx context.Context, name string, args ...string) (stdout, stderr string, err error)
	// LookPath reports the resolved absolute path of name and whether it was
	// found on the resolved PATH.
	LookPath(name string) (string, bool)
}

// mergePATH builds a PATH string from the login shell's PATH followed by extra
// fallback dirs, preserving order and dropping empties and duplicates.
func mergePATH(shellPATH string, extra []string) string {
	seen := map[string]bool{}
	out := make([]string, 0, 16)
	add := func(dirs []string) {
		for _, d := range dirs {
			if d == "" || seen[d] {
				continue
			}
			seen[d] = true
			out = append(out, d)
		}
	}
	add(strings.Split(shellPATH, ":"))
	add(extra)
	return strings.Join(out, ":")
}

// commonDirs are appended to the resolved PATH so tools installed in standard
// locations are found even when the login shell PATH is minimal.
func commonDirs() []string {
	home, _ := os.UserHomeDir()
	dirs := []string{"/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"}
	if home != "" {
		dirs = append(dirs, filepath.Join(home, ".local", "bin"), filepath.Join(home, "go", "bin"))
	}
	if gobin := os.Getenv("GOBIN"); gobin != "" {
		dirs = append(dirs, gobin)
	}
	return dirs
}

// resolveShellPATH asks the user's login+interactive shell for its PATH. A
// Finder-launched app inherits a minimal PATH, so this recovers the real one.
// Returns "" on any failure (the caller still has commonDirs()).
func resolveShellPATH(ctx context.Context) string {
	shell := os.Getenv("SHELL")
	if shell == "" {
		shell = "/bin/zsh"
	}
	cmd := exec.CommandContext(ctx, shell, "-lic", "echo $PATH")
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return ""
	}
	return strings.TrimSpace(out.String())
}

// execRunner is the real Runner. It resolves PATH once at construction and uses
// it for every child process and lookup.
type execRunner struct {
	pathEnv string
}

func newExecRunner(ctx context.Context) *execRunner {
	return &execRunner{pathEnv: mergePATH(resolveShellPATH(ctx), commonDirs())}
}

func (r *execRunner) env() []string {
	env := os.Environ()
	out := make([]string, 0, len(env)+1)
	for _, e := range env {
		if strings.HasPrefix(e, "PATH=") {
			continue
		}
		out = append(out, e)
	}
	return append(out, "PATH="+r.pathEnv)
}

func (r *execRunner) Run(ctx context.Context, name string, args ...string) (string, string, error) {
	path, ok := r.LookPath(name)
	if !ok {
		path = name // let exec produce a not-found error
	}
	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Env = r.env()
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	return stdout.String(), stderr.String(), err
}

func (r *execRunner) LookPath(name string) (string, bool) {
	for _, dir := range strings.Split(r.pathEnv, ":") {
		if dir == "" {
			continue
		}
		p := filepath.Join(dir, name)
		if fi, err := os.Stat(p); err == nil && !fi.IsDir() && fi.Mode()&0o111 != 0 {
			return p, true
		}
	}
	return "", false
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run MergePATH -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/ecosystem/runner.go internal/ecosystem/runner_test.go
git commit -m "feat(ecosystem): Runner interface + login-shell PATH resolution

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: npm registry latest-version fetch (Go)

**Files:**
- Create: `internal/ecosystem/registry.go`
- Test: `internal/ecosystem/registry_test.go`

**Interfaces:**
- Produces: `fetchLatest(ctx context.Context, client *http.Client, url string) (string, error)`; `const registryURL = "https://registry.npmjs.org/@angelmsger/openobserve-cli"`.

- [ ] **Step 1: Write the failing test**

Create `internal/ecosystem/registry_test.go`:

```go
package ecosystem

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFetchLatest(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte(`{"dist-tags":{"latest":"0.6.1"},"name":"@angelmsger/openobserve-cli"}`))
	}))
	defer srv.Close()

	got, err := fetchLatest(context.Background(), srv.Client(), srv.URL)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "0.6.1" {
		t.Errorf("got %q, want 0.6.1", got)
	}
}

func TestFetchLatestBadResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(500)
	}))
	defer srv.Close()
	if _, err := fetchLatest(context.Background(), srv.Client(), srv.URL); err == nil {
		t.Error("expected error on 500")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run FetchLatest -v`
Expected: FAIL — `undefined: fetchLatest`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/ecosystem/registry.go`:

```go
package ecosystem

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// registryURL is the npm registry metadata endpoint for the CLI package.
const registryURL = "https://registry.npmjs.org/@angelmsger/openobserve-cli"

// fetchLatest returns the dist-tags.latest version from the npm registry
// metadata at url. Errors (network, non-200, malformed) are returned so the
// caller can degrade to "no update known".
func fetchLatest(ctx context.Context, client *http.Client, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("registry status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return "", err
	}
	var v struct {
		DistTags struct {
			Latest string `json:"latest"`
		} `json:"dist-tags"`
	}
	if err := json.Unmarshal(body, &v); err != nil {
		return "", err
	}
	if v.DistTags.Latest == "" {
		return "", fmt.Errorf("no latest dist-tag")
	}
	return v.DistTags.Latest, nil
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run FetchLatest -v`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/ecosystem/registry.go internal/ecosystem/registry_test.go
git commit -m "feat(ecosystem): npm registry latest-version fetch

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Service — Status + actions with a fake Runner (Go)

**Files:**
- Create: `internal/ecosystem/ecosystem.go`
- Test: `internal/ecosystem/ecosystem_test.go`

**Interfaces:**
- Consumes: `Runner` (Task 2), `parse*` (Task 1).
- Produces:
  - Types `EcoStatus`, `CLIStatus`, `SkillStatus` (json tags per Global Constraints).
  - `type Service struct { run Runner; latest func(ctx context.Context) (string, error) }`
  - `func New(run Runner, latest func(ctx context.Context) (string, error)) *Service`
  - `func (s *Service) Status(ctx context.Context) (EcoStatus, error)`
  - `func (s *Service) InstallCLI(ctx) error`, `UpgradeCLI(ctx) error`, `UninstallCLI(ctx) error`, `InstallSkill(ctx) error`, `UninstallSkill(ctx) error`

- [ ] **Step 1: Write the failing test**

Create `internal/ecosystem/ecosystem_test.go`:

```go
package ecosystem

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// fakeRunner returns canned output keyed by the first arg (or name for lookups).
type fakeRunner struct {
	present map[string]string          // name -> resolved path (LookPath)
	out     map[string]string          // key -> stdout
	errs    map[string]error           // key -> err
	calls   []string                   // recorded "name arg0 arg1 ..."
}

func key(name string, args ...string) string { return strings.TrimSpace(name + " " + strings.Join(args, " ")) }

func (f *fakeRunner) LookPath(name string) (string, bool) { p, ok := f.present[name]; return p, ok }
func (f *fakeRunner) Run(_ context.Context, name string, args ...string) (string, string, error) {
	k := key(name, args...)
	f.calls = append(f.calls, k)
	// match on a prefix so callers can key by the meaningful leading args
	for prefix, out := range f.out {
		if strings.HasPrefix(k, prefix) {
			return out, "", f.errs[prefix]
		}
	}
	return "", "", nil
}

func fixedLatest(v string) func(context.Context) (string, error) {
	return func(context.Context) (string, error) { return v, nil }
}

func TestStatusInstalledUpdatable(t *testing.T) {
	f := &fakeRunner{
		present: map[string]string{"openobserve-cli": "/usr/local/bin/openobserve-cli", "npm": "/usr/local/bin/npm"},
		out: map[string]string{
			"openobserve-cli version":                            "openobserve-cli v0.5.0 (commit abc, built x)",
			"npm ls":                                             `{"dependencies":{"@angelmsger/openobserve-cli":{"version":"0.5.0"}}}`,
			"openobserve-cli skill status":                       `{"embedded_version":"0.2.0","installs":[{"agent":"claude-code","status":"installed"}]}`,
		},
	}
	s := New(f, fixedLatest("0.6.0"))
	st, err := s.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !st.CLI.Installed || st.CLI.Version != "0.5.0" || st.CLI.Managed != "npm" {
		t.Errorf("cli = %+v", st.CLI)
	}
	if !st.CLI.UpdateAvailable || st.CLI.LatestVersion != "0.6.0" {
		t.Errorf("update = %+v", st.CLI)
	}
	if !st.NpmAvailable {
		t.Error("npmAvailable should be true")
	}
	if !st.Skill.Installed || len(st.Skill.Agents) != 1 || st.Skill.Agents[0] != "claude-code" || st.Skill.Version != "0.2.0" {
		t.Errorf("skill = %+v", st.Skill)
	}
}

func TestStatusExternalNoNpm(t *testing.T) {
	f := &fakeRunner{
		present: map[string]string{"openobserve-cli": "/Users/x/go/bin/openobserve-cli"}, // no npm
		out: map[string]string{
			"openobserve-cli version":      "openobserve-cli v0.5.0",
			"openobserve-cli skill status": `{"embedded_version":"0.2.0","installs":[]}`,
		},
	}
	s := New(f, fixedLatest("0.5.0"))
	st, _ := s.Status(context.Background())
	if st.CLI.Managed != "external" {
		t.Errorf("managed = %q, want external", st.CLI.Managed)
	}
	if st.NpmAvailable {
		t.Error("npmAvailable should be false")
	}
	if st.CLI.UpdateAvailable {
		t.Error("no update when latest==version")
	}
}

func TestStatusNotInstalled(t *testing.T) {
	f := &fakeRunner{present: map[string]string{"npm": "/usr/local/bin/npm"}}
	s := New(f, fixedLatest("0.6.0"))
	st, _ := s.Status(context.Background())
	if st.CLI.Installed || st.CLI.Managed != "" {
		t.Errorf("cli = %+v", st.CLI)
	}
	if st.Skill.Installed {
		t.Error("skill should not be installed when CLI absent")
	}
}

func TestUninstallCLIGuardsExternal(t *testing.T) {
	f := &fakeRunner{
		present: map[string]string{"openobserve-cli": "/Users/x/go/bin/openobserve-cli", "npm": "/usr/local/bin/npm"},
		out: map[string]string{
			"openobserve-cli version":      "openobserve-cli v0.5.0",
			"npm ls":                       `{"dependencies":{}}`,
			"openobserve-cli skill status": `{"embedded_version":"0.2.0","installs":[]}`,
		},
	}
	s := New(f, fixedLatest("0.5.0"))
	if err := s.UninstallCLI(context.Background()); err == nil {
		t.Error("expected UninstallCLI to refuse an externally-managed binary")
	}
}

func TestActionCommands(t *testing.T) {
	f := &fakeRunner{
		present: map[string]string{"openobserve-cli": "/x/openobserve-cli", "npm": "/x/npm"},
		out:     map[string]string{"npm ls": `{"dependencies":{"@angelmsger/openobserve-cli":{}}}`, "openobserve-cli version": "v0.5.0"},
	}
	s := New(f, fixedLatest("0.5.0"))
	ctx := context.Background()
	_ = s.InstallCLI(ctx)
	_ = s.UpgradeCLI(ctx)
	_ = s.InstallSkill(ctx)
	_ = s.UninstallSkill(ctx)
	joined := strings.Join(f.calls, "\n")
	for _, want := range []string{
		"npm install -g @angelmsger/openobserve-cli",
		"npm install -g @angelmsger/openobserve-cli@latest",
		"openobserve-cli skill install",
		"openobserve-cli skill uninstall",
	} {
		if !strings.Contains(joined, want) {
			t.Errorf("missing command %q in\n%s", want, joined)
		}
	}
}

func TestActionErrorSurfacesStderr(t *testing.T) {
	f := &fakeRunner{
		present: map[string]string{"npm": "/x/npm"},
		out:     map[string]string{"npm install": ""},
		errs:    map[string]error{"npm install": errors.New("exit 1")},
	}
	// stderr is returned by the fake as "" here; ensure error is non-nil and wraps.
	s := New(f, fixedLatest(""))
	if err := s.InstallCLI(context.Background()); err == nil {
		t.Error("expected error when npm install fails")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run 'Status|Uninstall|Action' -v`
Expected: FAIL — `undefined: New`.

- [ ] **Step 3: Write minimal implementation**

Create `internal/ecosystem/ecosystem.go`:

```go
package ecosystem

import (
	"context"
	"fmt"
	"strings"
)

// EcoStatus is the full detection snapshot returned to the frontend.
type EcoStatus struct {
	NpmAvailable bool        `json:"npmAvailable"`
	CLI          CLIStatus   `json:"cli"`
	Skill        SkillStatus `json:"skill"`
}

// CLIStatus describes the openobserve-cli install.
type CLIStatus struct {
	Installed       bool   `json:"installed"`
	Version         string `json:"version"`
	Path            string `json:"path"`
	Managed         string `json:"managed"` // "npm" | "external" | ""
	LatestVersion   string `json:"latestVersion"`
	UpdateAvailable bool   `json:"updateAvailable"`
}

// SkillStatus describes the companion Skill deployment.
type SkillStatus struct {
	Installed bool     `json:"installed"`
	Version   string   `json:"version"`
	Agents    []string `json:"agents"`
}

// Service performs detection and management via an injected Runner and a latest-
// version fetcher.
type Service struct {
	run    Runner
	latest func(ctx context.Context) (string, error)
}

// New builds a Service.
func New(run Runner, latest func(ctx context.Context) (string, error)) *Service {
	return &Service{run: run, latest: latest}
}

// Status gathers CLI + Skill + npm state in one pass. Missing tools are normal
// states, not errors; it only returns an error for an unexpected internal fault
// (currently never).
func (s *Service) Status(ctx context.Context) (EcoStatus, error) {
	var st EcoStatus
	_, st.NpmAvailable = s.run.LookPath("npm")

	cliPath, cliOK := s.run.LookPath("openobserve-cli")
	if cliOK {
		st.CLI.Installed = true
		st.CLI.Path = cliPath
		if out, _, err := s.run.Run(ctx, "openobserve-cli", "version"); err == nil {
			st.CLI.Version = parseCLIVersion(out)
		}
		st.CLI.Managed = "external"
		if st.NpmAvailable {
			// `npm ls` exits non-zero when the package is absent but still prints
			// JSON, so parse stdout regardless of err.
			out, _, _ := s.run.Run(ctx, "npm", "ls", "-g", "--depth=0", "--json", pkgName)
			if parseNpmManaged(out) {
				st.CLI.Managed = "npm"
			}
		}
		if latest, err := s.latest(ctx); err == nil && latest != "" {
			st.CLI.LatestVersion = latest
			st.CLI.UpdateAvailable = st.CLI.Version != "" && compareSemver(latest, st.CLI.Version) > 0
		}
		// Skill status requires the CLI. Suppress the CLI's stderr discovery nudge.
		if out, _, err := s.runSkillStatus(ctx); err == nil {
			st.Skill.Installed, st.Skill.Agents, st.Skill.Version = parseSkillStatus(out)
		}
	}
	if st.Skill.Agents == nil {
		st.Skill.Agents = []string{}
	}
	return st, nil
}

// runSkillStatus runs `openobserve-cli skill status --format json` with the
// skill-loaded handshake env so the CLI does not print discovery hints.
func (s *Service) runSkillStatus(ctx context.Context) (string, string, error) {
	// The env is set on the process by execRunner via os.Environ(); we set it in
	// the current process env so children inherit it. Setting per-call keeps it
	// scoped to detection.
	return s.run.Run(ctx, "openobserve-cli", "skill", "status", "--format", "json")
}

// fail turns a command result into an error carrying the trimmed stderr (or the
// raw error when stderr is empty).
func fail(action, stderr string, err error) error {
	msg := strings.TrimSpace(stderr)
	if msg == "" {
		msg = err.Error()
	}
	return fmt.Errorf("%s failed: %s", action, msg)
}

func (s *Service) InstallCLI(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "npm", "install", "-g", pkgName)
	if err != nil {
		return fail("install openobserve-cli", stderr, err)
	}
	return nil
}

func (s *Service) UpgradeCLI(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "npm", "install", "-g", pkgName+"@latest")
	if err != nil {
		return fail("upgrade openobserve-cli", stderr, err)
	}
	return nil
}

func (s *Service) UninstallCLI(ctx context.Context) error {
	st, _ := s.Status(ctx)
	if st.CLI.Managed != "npm" {
		return fmt.Errorf("openobserve-cli is not managed by npm; uninstall it the way it was installed")
	}
	_, stderr, err := s.run.Run(ctx, "npm", "uninstall", "-g", pkgName)
	if err != nil {
		return fail("uninstall openobserve-cli", stderr, err)
	}
	return nil
}

func (s *Service) InstallSkill(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "openobserve-cli", "skill", "install")
	if err != nil {
		return fail("install Skill", stderr, err)
	}
	return nil
}

func (s *Service) UninstallSkill(ctx context.Context) error {
	_, stderr, err := s.run.Run(ctx, "openobserve-cli", "skill", "uninstall")
	if err != nil {
		return fail("uninstall Skill", stderr, err)
	}
	return nil
}
```

Note on the `OPENOBSERVE_CLI_SKILL=1` handshake: `execRunner` (Task 2) inherits the parent process environment. Set the variable once in `app.go`'s Service construction (Task 5) via `os.Setenv("OPENOBSERVE_CLI_SKILL", "1")` so every child inherits it and the CLI suppresses its stderr nudge. Detection reads stdout, so the nudge is harmless either way; the env keeps output clean.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -v`
Expected: PASS (all tests in the package).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/ecosystem/ecosystem.go internal/ecosystem/ecosystem_test.go
git commit -m "feat(ecosystem): Service detection + install/upgrade/uninstall actions

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Wire Service into app.go + regenerate bindings (Go + bindings)

**Files:**
- Modify: `app.go` (add import, `eco` field, construction, six methods)
- Test: `app_ecosystem_test.go` (new)
- Regenerate: `frontend/wailsjs/go/main/App.{d.ts,js}`, `frontend/wailsjs/go/models.ts`

**Interfaces:**
- Consumes: `ecosystem.New`, `ecosystem.newExecRunner` (unexported — expose a constructor), `ecosystem.EcoStatus`.
- Produces (bound methods): `EcosystemStatus() (ecosystem.EcoStatus, error)`, `InstallCLI() error`, `UpgradeCLI() error`, `UninstallCLI() error`, `InstallSkill() error`, `UninstallSkill() error`.

Because `newExecRunner` and `fetchLatest` are unexported, add one exported constructor to the ecosystem package that builds a production Service.

- [ ] **Step 1: Add the production constructor + a test for it**

Append to `internal/ecosystem/ecosystem.go`:

```go
// NewProduction builds a Service backed by the real exec Runner (PATH resolved
// from the login shell) and the npm-registry latest fetcher with a short
// timeout. It also sets the Skill handshake env so the CLI suppresses its
// stderr discovery nudge in child processes.
func NewProduction(ctx context.Context) *Service {
	os.Setenv("OPENOBSERVE_CLI_SKILL", "1")
	run := newExecRunner(ctx)
	latest := func(c context.Context) (string, error) {
		cctx, cancel := context.WithTimeout(c, 3*time.Second)
		defer cancel()
		return fetchLatest(cctx, http.DefaultClient, registryURL)
	}
	return New(run, latest)
}
```

Add imports `net/http`, `os`, `time` to `ecosystem.go`'s import block.

Create `internal/ecosystem/production_test.go`:

```go
package ecosystem

import (
	"context"
	"testing"
)

func TestNewProductionBuilds(t *testing.T) {
	s := NewProduction(context.Background())
	if s == nil || s.run == nil || s.latest == nil {
		t.Fatal("NewProduction returned an incomplete Service")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run NewProduction -v`
Expected: FAIL — `undefined: NewProduction`.

- [ ] **Step 3: Implement — add the constructor (above) then wire app.go**

In `app.go`, add to the import block:

```go
	"github.com/angelmsger/o3/internal/ecosystem"
```

Add a field to `App` (after `client api.Client`):

```go
	eco *ecosystem.Service
```

In `startup`, build the Service once the Wails context exists (replace the existing `startup` body):

```go
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	a.eco = ecosystem.NewProduction(ctx)
	_ = a.rebuildClient() // best-effort; data methods re-report if it fails
}
```

Append the six bound methods near the other bound methods (before `humanBytes`):

```go
// EcosystemStatus reports the openobserve-cli + companion Skill install state.
func (a *App) EcosystemStatus() (ecosystem.EcoStatus, error) {
	return a.eco.Status(a.ctx)
}

// InstallCLI installs openobserve-cli via npm.
func (a *App) InstallCLI() error { return apperr.Wrap(a.eco.InstallCLI(a.ctx)) }

// UpgradeCLI upgrades openobserve-cli to the latest npm release.
func (a *App) UpgradeCLI() error { return apperr.Wrap(a.eco.UpgradeCLI(a.ctx)) }

// UninstallCLI removes openobserve-cli (npm-managed installs only).
func (a *App) UninstallCLI() error { return apperr.Wrap(a.eco.UninstallCLI(a.ctx)) }

// InstallSkill deploys the companion Skill into every detected agent.
func (a *App) InstallSkill() error { return apperr.Wrap(a.eco.InstallSkill(a.ctx)) }

// UninstallSkill removes the companion Skill from all agents.
func (a *App) UninstallSkill() error { return apperr.Wrap(a.eco.UninstallSkill(a.ctx)) }
```

- [ ] **Step 4: Write a smoke test that the methods exist and don't panic with a stub Service**

Create `app_ecosystem_test.go`:

```go
package main

import (
	"context"
	"testing"

	"github.com/angelmsger/o3/internal/ecosystem"
)

// stubRunner reports nothing installed.
type stubRunner struct{}

func (stubRunner) LookPath(string) (string, bool) { return "", false }
func (stubRunner) Run(context.Context, string, ...string) (string, string, error) {
	return "", "", nil
}

func TestEcosystemStatusMethod(t *testing.T) {
	a := &App{ctx: context.Background()}
	a.eco = ecosystem.New(stubRunner{}, func(context.Context) (string, error) { return "", nil })
	st, err := a.EcosystemStatus()
	if err != nil {
		t.Fatal(err)
	}
	if st.CLI.Installed {
		t.Error("expected CLI not installed with stub runner")
	}
}
```

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run NewProduction -v && go test . -run EcosystemStatusMethod -v`
Expected: PASS.

- [ ] **Step 5: Build + regenerate bindings + restore churn**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
go build ./...
wails generate module
git checkout -- frontend/wailsjs/runtime/ go.mod go.sum
```

Verify the new methods appear:

Run: `grep -c 'EcosystemStatus\|InstallCLI\|UpgradeCLI\|UninstallCLI\|InstallSkill\|UninstallSkill' frontend/wailsjs/go/main/App.d.ts`
Expected: `6`

Run: `grep -c 'EcoStatus\|CLIStatus\|SkillStatus' frontend/wailsjs/go/models.ts`
Expected: `>= 3`

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add app.go app_ecosystem_test.go internal/ecosystem/ecosystem.go internal/ecosystem/production_test.go \
  frontend/wailsjs/go/main/App.d.ts frontend/wailsjs/go/main/App.js frontend/wailsjs/go/models.ts
git commit -m "feat(ecosystem): bind EcosystemStatus + install/upgrade/uninstall methods

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Frontend pure logic + types (vitest)

**Files:**
- Create: `frontend/src/lib/ecosystem.ts`
- Test: `frontend/src/lib/ecosystem.test.ts`

**Interfaces:**
- Produces: TS types `CLIStatus`, `SkillStatus`, `EcoStatus`; functions `compareSemver(a,b): number`, `dotState(cli): 'ok'|'update'|'off'`, `ecoTooltip(cli): string`, `cliPill(cli): { label: string; tone: 'ok'|'update'|'ext'|'off' }`, `agentLabel(id): string`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/ecosystem.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { compareSemver, dotState, ecoTooltip, cliPill, agentLabel } from './ecosystem';
import type { CLIStatus } from './ecosystem';

const base: CLIStatus = {
  installed: false, version: '', path: '', managed: '', latestVersion: '', updateAvailable: false,
};

describe('compareSemver', () => {
  it('orders versions numerically', () => {
    expect(compareSemver('0.6.0', '0.5.0')).toBe(1);
    expect(compareSemver('0.5.0', '0.6.0')).toBe(-1);
    expect(compareSemver('0.5.10', '0.5.2')).toBe(1);
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('dotState', () => {
  it('off when not installed', () => {
    expect(dotState(base)).toBe('off');
  });
  it('update when an upgrade exists', () => {
    expect(dotState({ ...base, installed: true, version: '0.5.0', latestVersion: '0.6.0', updateAvailable: true })).toBe('update');
  });
  it('ok when installed and current', () => {
    expect(dotState({ ...base, installed: true, version: '0.6.0' })).toBe('ok');
  });
});

describe('ecoTooltip', () => {
  it('names the not-installed state', () => {
    expect(ecoTooltip(base)).toBe('openobserve-cli not installed');
  });
  it('shows the target version on update', () => {
    expect(ecoTooltip({ ...base, installed: true, version: '0.5.0', latestVersion: '0.6.0', updateAvailable: true }))
      .toBe('Update available: v0.5.0 -> v0.6.0');
  });
  it('confirms up to date', () => {
    expect(ecoTooltip({ ...base, installed: true, version: '0.6.0' })).toBe('openobserve-cli v0.6.0 - up to date');
  });
});

describe('cliPill', () => {
  it('not installed', () => expect(cliPill(base)).toEqual({ label: 'Not installed', tone: 'off' }));
  it('external takes precedence', () =>
    expect(cliPill({ ...base, installed: true, managed: 'external', updateAvailable: true }))
      .toEqual({ label: 'Installed - external', tone: 'ext' }));
  it('update available for npm', () =>
    expect(cliPill({ ...base, installed: true, managed: 'npm', updateAvailable: true }))
      .toEqual({ label: 'Update available', tone: 'update' }));
  it('installed and current', () =>
    expect(cliPill({ ...base, installed: true, managed: 'npm' }))
      .toEqual({ label: 'Installed', tone: 'ok' }));
});

describe('agentLabel', () => {
  it('maps known ids', () => {
    expect(agentLabel('claude-code')).toBe('Claude Code');
    expect(agentLabel('codex')).toBe('Codex');
  });
  it('falls back to the id', () => {
    expect(agentLabel('cursor')).toBe('cursor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run src/lib/ecosystem.test.ts`
Expected: FAIL — cannot resolve `./ecosystem`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/src/lib/ecosystem.ts`:

```ts
// Pure status-derivation logic for the AI Ecosystem panel + nav-rail dot.
// Kept free of Wails imports so it is unit-tested like lib/format.ts.

export interface CLIStatus {
  installed: boolean;
  version: string;
  path: string;
  managed: string; // "npm" | "external" | "" — plain string so it stays
                   // assignable from the generated Wails model (which types it string)
  latestVersion: string;
  updateAvailable: boolean;
}

export interface SkillStatus {
  installed: boolean;
  version: string;
  agents: string[];
}

export interface EcoStatus {
  npmAvailable: boolean;
  cli: CLIStatus;
  skill: SkillStatus;
}

// compareSemver returns -1, 0, or 1 comparing two "x.y.z" strings numerically.
export function compareSemver(a: string, b: string): number {
  const pa = a.split('.');
  const pb = b.split('.');
  for (let i = 0; i < 3; i++) {
    const x = parseInt(pa[i] ?? '0', 10) || 0;
    const y = parseInt(pb[i] ?? '0', 10) || 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export type DotState = 'ok' | 'update' | 'off';

// dotState maps the CLI status to the nav-rail status dot.
export function dotState(cli: CLIStatus): DotState {
  if (!cli.installed) return 'off';
  if (cli.updateAvailable) return 'update';
  return 'ok';
}

// ecoTooltip is the nav-rail shortcut tooltip, mirroring dotState.
export function ecoTooltip(cli: CLIStatus): string {
  if (!cli.installed) return 'openobserve-cli not installed';
  if (cli.updateAvailable) return `Update available: v${cli.version} -> v${cli.latestVersion}`;
  return `openobserve-cli v${cli.version} - up to date`;
}

export type PillTone = 'ok' | 'update' | 'ext' | 'off';

// cliPill is the status pill on the CLI card. External wins over update because
// o3 cannot auto-upgrade a binary it did not install via npm.
export function cliPill(cli: CLIStatus): { label: string; tone: PillTone } {
  if (!cli.installed) return { label: 'Not installed', tone: 'off' };
  if (cli.managed === 'external') return { label: 'Installed - external', tone: 'ext' };
  if (cli.updateAvailable) return { label: 'Update available', tone: 'update' };
  return { label: 'Installed', tone: 'ok' };
}

const AGENT_LABELS: Record<string, string> = {
  'claude-code': 'Claude Code',
  codex: 'Codex',
};

// agentLabel maps an agent id to a display label, falling back to the raw id.
export function agentLabel(id: string): string {
  return AGENT_LABELS[id] ?? id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run src/lib/ecosystem.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/lib/ecosystem.ts frontend/src/lib/ecosystem.test.ts
git commit -m "feat(ecosystem): frontend pure status-derivation logic + types

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: AIEcosystem component + SettingsModal swap + App wiring

**Files:**
- Create: `frontend/src/components/AIEcosystem.tsx`, `frontend/src/components/AIEcosystem.module.css`
- Modify: `frontend/src/components/SettingsModal.tsx` (rename tab, replace agent panel, swap props)
- Modify: `frontend/src/App.tsx` (ecosystem state + handlers, remove `mcpOn`, pass `ecosystem` bag)

**Interfaces:**
- Consumes: `EcoStatus`, `cliPill`, `dotState`, `ecoTooltip`, `agentLabel` (Task 6); Wails `EcosystemStatus`, `InstallCLI`, `UpgradeCLI`, `UninstallCLI`, `InstallSkill`, `UninstallSkill` (Task 5); `copyText` (`lib/clipboard`), `BrowserOpenURL` (`wailsjs/runtime/runtime`).
- Produces: `AIEcosystem` component with prop type `EcosystemPaneProps`:
  ```ts
  interface EcosystemPaneProps {
    status: EcoStatus | null;
    busy: string | null;   // 'cli-install'|'cli-upgrade'|'cli-uninstall'|'skill-install'|'skill-uninstall'|null
    error: string;
    onInstallCli: () => void;
    onUpgradeCli: () => void;
    onUninstallCli: () => void;
    onInstallSkill: () => void;
    onUninstallSkill: () => void;
    onOpenDocs: () => void;
    onCopy: (cmd: string) => void;
  }
  ```
  `AIEcosystem` also takes `accent: string`.

- [ ] **Step 1: Create the AIEcosystem component**

Create `frontend/src/components/AIEcosystem.tsx`:

```tsx
/* AIEcosystem — Settings "AI Ecosystem" tab (design Observe.dc.html). Two cards:
   openobserve-cli (npm-managed, provenance-aware) and its companion Skill
   (managed by shelling out to the CLI). Driven entirely by EcoStatus + callbacks
   so the flow is testable via lib/ecosystem. */
import type { ReactElement } from 'react';
import { hexA } from '../lib/format';
import { cliPill, agentLabel } from '../lib/ecosystem';
import type { EcoStatus } from '../lib/ecosystem';
import styles from './AIEcosystem.module.css';

export interface EcosystemPaneProps {
  status: EcoStatus | null;
  busy: string | null;
  error: string;
  onInstallCli: () => void;
  onUpgradeCli: () => void;
  onUninstallCli: () => void;
  onInstallSkill: () => void;
  onUninstallSkill: () => void;
  onOpenDocs: () => void;
  onCopy: (cmd: string) => void;
}

const PKG = '@angelmsger/openobserve-cli';
const CLI_INSTALL_CMD = `npm install -g ${PKG}`;
const SKILL_INSTALL_CMD = 'openobserve-cli skill install';

const PILL_TONE: Record<string, { bg: string; fg: string }> = {
  ok: { bg: 'rgba(52,224,161,.12)', fg: '#34e0a1' },
  update: { bg: 'rgba(245,179,64,.12)', fg: '#f5b340' },
  ext: { bg: 'rgba(255,255,255,.06)', fg: 'var(--tx-06)' },
  off: { bg: 'rgba(255,255,255,.05)', fg: 'var(--tx-09)' },
};

export function AIEcosystem({
  status, busy, error, accent,
  onInstallCli, onUpgradeCli, onUninstallCli, onInstallSkill, onUninstallSkill, onOpenDocs, onCopy,
}: EcosystemPaneProps & { accent: string }): ReactElement {
  const cli = status?.cli;
  const skill = status?.skill;
  const npm = status?.npmAvailable ?? false;
  const pill = cli ? cliPill(cli) : { label: 'Checking…', tone: 'off' as const };
  const tone = PILL_TONE[pill.tone];

  // CLI primary button: Install (not installed) / Upgrade (update available) /
  // nothing when current. npm-managed only; external defers to docs.
  const cliInstalled = !!cli?.installed;
  const cliExternal = cli?.managed === 'external';
  const cliUpdate = !!cli?.updateAvailable;

  return (
    <div>
      <div className={styles.panelTitle}>AI Ecosystem</div>
      <div className={styles.panelSub}>
        o3 pairs with <b style={{ color: 'var(--tx-06)' }}>openobserve-cli</b> — an agent-native command-line tool that lets Claude Code, Codex and other coding agents query this instance directly. It covers the agent scenarios end-to-end, so there is no MCP server to run or expose. Install the CLI and its companion Skill below.
      </div>

      {/* ===== openobserve-cli card ===== */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.iconMono} style={{ color: accent }}>&gt;_</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardTitle}>openobserve-cli</span>
              {cli?.version && <span className={styles.verLabel}>v{cli.version}</span>}
            </div>
            <div className={styles.cardDesc}>Query logs, metrics &amp; traces from the terminal — JSON output built for agents.</div>
          </div>
          <span className={styles.pill} style={{ background: tone.bg, color: tone.fg }}>{pill.label}</span>
        </div>

        <div className={styles.cmdRow}>
          <code className={styles.cmd}>{CLI_INSTALL_CMD}</code>
          <button className={styles.copyBtn} title="Copy" onClick={() => onCopy(CLI_INSTALL_CMD)}>⧉</button>
        </div>

        <div className={styles.actions}>
          {!cliInstalled && (
            npm
              ? <button className={styles.primary} style={{ background: accent }} disabled={busy === 'cli-install'} onClick={onInstallCli}>{busy === 'cli-install' ? 'Installing…' : 'Install'}</button>
              : <button className={styles.primary} style={{ background: accent }} onClick={onOpenDocs}>Install docs</button>
          )}
          {cliInstalled && cliExternal && (
            <button className={styles.secondary} onClick={onOpenDocs}>Manage via docs</button>
          )}
          {cliInstalled && !cliExternal && cliUpdate && (
            <button className={styles.primary} style={{ background: accent }} disabled={busy === 'cli-upgrade'} onClick={onUpgradeCli}>{busy === 'cli-upgrade' ? 'Upgrading…' : `Upgrade to v${cli?.latestVersion}`}</button>
          )}
          {cliInstalled && !cliExternal && (
            <button className={styles.danger} disabled={busy === 'cli-uninstall'} onClick={onUninstallCli}>{busy === 'cli-uninstall' ? 'Removing…' : 'Uninstall'}</button>
          )}
        </div>
        {cliInstalled && cliExternal && (
          <div className={styles.hint}>Installed outside npm (e.g. go install). o3 leaves it untouched — upgrade or remove it the way you installed it.</div>
        )}
      </div>

      {/* ===== companion Skill card ===== */}
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.iconBox}>
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 15l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardTitle}>openobserve</span>
              <span className={styles.skillTag}>Skill</span>
            </div>
            <div className={styles.cardDesc}>Teaches your coding agent the CLI — deploys into each agent it detects.</div>
          </div>
          <span className={styles.pill} style={skill?.installed ? { background: PILL_TONE.ok.bg, color: PILL_TONE.ok.fg } : { background: PILL_TONE.off.bg, color: PILL_TONE.off.fg }}>
            {skill?.installed ? 'Deployed' : 'Not installed'}
          </span>
        </div>

        {skill?.installed && skill.agents.length > 0 && (
          <div className={styles.agentRow}>
            <span className={styles.agentLabel}>Deployed to</span>
            {skill.agents.map((a) => (
              <span key={a} className={styles.agentChip} style={{ borderColor: hexA(accent, 0.3) }}>
                <span className={styles.agentDot} style={{ background: accent }} />{agentLabel(a)}
              </span>
            ))}
          </div>
        )}

        <div className={styles.cmdRow}>
          <code className={styles.cmd}>{SKILL_INSTALL_CMD}</code>
        </div>

        {!cliInstalled ? (
          <div className={styles.hint}>Install openobserve-cli first — the Skill ships inside the binary.</div>
        ) : (
          <div className={styles.actions}>
            <button className={styles.primary} style={{ background: accent }} disabled={busy === 'skill-install'} onClick={onInstallSkill}>
              {busy === 'skill-install' ? 'Installing…' : (skill?.installed ? 'Re-deploy' : 'Install')}
            </button>
            {skill?.installed && (
              <button className={styles.danger} disabled={busy === 'skill-uninstall'} onClick={onUninstallSkill}>{busy === 'skill-uninstall' ? 'Removing…' : 'Uninstall'}</button>
            )}
          </div>
        )}
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.learn}>
        <span>Learn more:</span>
        <button className={styles.learnLink} style={{ color: accent }} onClick={onOpenDocs}>CLI reference</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the stylesheet**

Create `frontend/src/components/AIEcosystem.module.css`:

```css
.panelTitle { font-size: 19px; font-weight: 600; color: var(--tx-hi); margin-bottom: 5px; }
.panelSub { font-size: 13px; color: var(--tx-09); margin-bottom: 22px; line-height: 1.55; }

.card {
  background: var(--sf-05);
  border: 1px solid rgba(var(--ink),.06);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 14px;
}
.cardHead { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.iconMono {
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--sf-ctrl); border: 1px solid rgba(var(--ink),.08);
  display: flex; align-items: center; justify-content: center; flex: none;
  font-family: 'JetBrains Mono', monospace; font-size: 15px; font-weight: 700;
}
.iconBox {
  width: 40px; height: 40px; border-radius: 10px;
  background: var(--sf-ctrl); border: 1px solid rgba(var(--ink),.08);
  display: flex; align-items: center; justify-content: center; flex: none;
}
.cardTitleRow { display: flex; align-items: center; gap: 8px; }
.cardTitle { font-size: 13.5px; color: var(--tx-01); font-weight: 600; font-family: 'JetBrains Mono', monospace; }
.verLabel { font-size: 11px; color: var(--tx-07); font-family: 'JetBrains Mono', monospace; }
.skillTag { font-size: 11px; color: var(--tx-10); }
.cardDesc { font-size: 11.5px; color: var(--tx-09); margin-top: 2px; }
.pill { font-size: 10.5px; font-weight: 700; padding: 3px 9px; border-radius: 20px; white-space: nowrap; flex: none; }

.cmdRow { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; }
.cmd {
  flex: 1; min-width: 0;
  background: var(--sf-ctrl); border: 1px solid rgba(var(--ink),.08); border-radius: 7px;
  padding: 8px 11px; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: #a3e08c;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.copyBtn {
  height: 33px; padding: 0 11px; border-radius: 7px;
  border: 1px solid rgba(var(--ink),.1); background: var(--sf-ctrl); color: var(--tx-06);
  font-size: 12px; cursor: pointer; font-family: 'JetBrains Mono', monospace; flex: none;
}

.actions { display: flex; gap: 8px; }
.primary {
  height: 36px; padding: 0 16px; border-radius: 8px; border: none;
  color: #06181a; font-size: 12.5px; font-weight: 700; cursor: pointer; font-family: inherit;
}
.primary:disabled { opacity: .6; cursor: default; }
.secondary {
  height: 36px; padding: 0 16px; border-radius: 8px;
  border: 1px solid rgba(var(--ink),.14); background: transparent; color: var(--tx-06);
  font-size: 12.5px; cursor: pointer; font-family: inherit;
}
.danger {
  height: 36px; padding: 0 14px; border-radius: 8px;
  border: 1px solid rgba(244,104,95,.3); background: transparent; color: #f4685f;
  font-size: 12.5px; cursor: pointer; font-family: inherit;
}
.danger:disabled { opacity: .6; cursor: default; }

.hint { font-size: 11px; color: var(--tx-10); margin-top: 10px; line-height: 1.5; }

.agentRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.agentLabel { font-size: 11px; color: var(--tx-10); }
.agentChip {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11.5px; color: var(--tx-03);
  border: 1px solid rgba(var(--ink),.12); border-radius: 20px; padding: 3px 10px;
}
.agentDot { width: 5px; height: 5px; border-radius: 50%; }

.error { font-size: 12px; color: #f4685f; margin: 4px 0 14px; line-height: 1.5; }

.learn { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--tx-10); margin-top: 4px; }
.learnLink { background: transparent; border: none; cursor: pointer; font-size: 11.5px; padding: 0; }
```

- [ ] **Step 3: Swap the MCP panel in SettingsModal**

In `frontend/src/components/SettingsModal.tsx`:

3a. Add imports after line 6:

```tsx
import { AIEcosystem } from './AIEcosystem';
import type { EcosystemPaneProps } from './AIEcosystem';
```

3b. In `SettingsModalProps` (lines 27-45): remove `mcpOn: boolean;` (line 33) and `onToggleMcp: () => void;` (line 42). Add:

```tsx
  ecosystem: EcosystemPaneProps;
```

3c. Rename the tab label (line 51): `['agent', 'Agent · MCP'],` -> `['agent', 'AI Ecosystem'],`

3d. In the destructured params (lines 84-111): remove `mcpOn,` and `onToggleMcp,`; add `ecosystem,`.

3e. Delete the now-unused constants `AGENT_TABS` (lines 72-76) and `AGENT_DESC` (lines 78-82) and the `agentMode` state (line 113) — they belonged to the MCP mock. Removing `agentMode` leaves `useState` unused, so also change line 1 from `import { useState } from 'react';` to `import type { ReactElement } from 'react';` and delete the now-duplicate `import type { ReactElement } from 'react';` on line 2 (i.e. collapse to a single `import type { ReactElement } from 'react';`). Verify no other `useState` call remains in the file first (there is none — `authMode`/`_scheme` are plain derivations).

3f. Replace the entire `{tab === 'agent' && ( ... )}` block (lines 465-549) with:

```tsx
              {/* ===== AI ECOSYSTEM ===== */}
              {tab === 'agent' && (
                <AIEcosystem accent={accent} {...ecosystem} />
              )}
```

- [ ] **Step 4: Wire App.tsx**

In `frontend/src/App.tsx`:

4a. Extend the Wails import (lines 30-33) to add the six methods:

```tsx
import {
  ListContexts, SwitchContext, SaveContext, TestConnection, RemoveContext,
  ListStreams, GetFields, RunQuery, GetPrefs, SavePrefs, SetDockTheme, SetAppearance,
  EcosystemStatus, InstallCLI, UpgradeCLI, UninstallCLI, InstallSkill, UninstallSkill,
} from '../wailsjs/go/main/App';
```

4b. Add imports for the ecosystem types + docs opener near the other lib imports (after line 26 `import { copyText } from './lib/clipboard';`):

```tsx
import type { EcoStatus } from './lib/ecosystem';
import { BrowserOpenURL } from '../wailsjs/runtime/runtime';
```

4c. Remove the `mcpOn` state (line 94: `const [mcpOn, setMcpOn] = useState<boolean>(false);`). Add ecosystem state near it:

```tsx
  const [ecoStatus, setEcoStatus] = useState<EcoStatus | null>(null);
  const [ecoBusy, setEcoBusy] = useState<string | null>(null);
  const [ecoError, setEcoError] = useState<string>('');
```

4d. Add a refresh helper + fetch effect. Place after the prefs effects (after line 198):

```tsx
  // AI Ecosystem: detect CLI + Skill state. Refresh on mount and whenever the
  // settings modal opens (so it reflects installs done in another terminal).
  const refreshEco = () => {
    EcosystemStatus().then(setEcoStatus).catch(() => setEcoStatus(null));
  };
  useEffect(() => { refreshEco(); }, []);
  useEffect(() => { if (settingsOpen) refreshEco(); }, [settingsOpen]);

  // runEco wraps an action method: set busy, run, surface errors, refresh state.
  const runEco = (key: string, fn: () => Promise<void>) => {
    setEcoBusy(key);
    setEcoError('');
    fn()
      .then(() => { refreshEco(); })
      .catch((e) => { setEcoError(parseAppError(e).message); })
      .finally(() => setEcoBusy(null));
  };

  const CLI_DOCS_URL = 'https://github.com/AngelMsger/openobserve-cli#installation';
```

4e. Build the `ecosystem` prop bag and pass it to `SettingsModal`. Remove the `mcpOn={mcpOn}` (line 815 region) and `onToggleMcp={...}` (line 765) props. Add:

```tsx
            ecosystem={{
              status: ecoStatus,
              busy: ecoBusy,
              error: ecoError,
              onInstallCli: () => runEco('cli-install', InstallCLI),
              onUpgradeCli: () => runEco('cli-upgrade', UpgradeCLI),
              onUninstallCli: () => runEco('cli-uninstall', UninstallCLI),
              onInstallSkill: () => runEco('skill-install', InstallSkill),
              onUninstallSkill: () => runEco('skill-uninstall', UninstallSkill),
              onOpenDocs: () => BrowserOpenURL(CLI_DOCS_URL),
              onCopy: (cmd: string) => { copyText(cmd); },
            }}
```

- [ ] **Step 5: Build and run tests**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npm run build`
Expected: tsc + vite build succeed (no type errors — `mcpOn`/`onToggleMcp` fully removed, `ecosystem` prop supplied).

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run`
Expected: PASS (all suites, including the new ecosystem test).

- [ ] **Step 6: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/components/AIEcosystem.tsx frontend/src/components/AIEcosystem.module.css \
  frontend/src/components/SettingsModal.tsx frontend/src/App.tsx
git commit -m "feat(ecosystem): AI Ecosystem settings tab replacing the MCP mock

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Nav-rail shortcut + status dot

**Files:**
- Modify: `frontend/src/components/NavRail.tsx` (add `>_` button + dot + tooltip, new props)
- Modify: `frontend/src/components/NavRail.module.css` (dot state colors)
- Modify: `frontend/src/App.tsx` (compute dot state from `ecoStatus`, wire `onOpenEcosystem`)

**Interfaces:**
- Consumes: `dotState`, `ecoTooltip` (Task 6), `ecoStatus` (Task 7).
- Produces: `NavRail` gains props `eco: { state: 'ok'|'update'|'off'; title: string }` and `onOpenEcosystem: () => void`.

- [ ] **Step 1: Add the shortcut to NavRail**

In `frontend/src/components/NavRail.tsx`, change the component signature (lines 41-45) to:

```tsx
export function NavRail({ activeNav, onPick, onOpenSettings, eco, onOpenEcosystem }: {
  activeNav: string;
  onPick: (name: string) => void;
  onOpenSettings: () => void;
  eco: { state: 'ok' | 'update' | 'off'; title: string };
  onOpenEcosystem: () => void;
}) {
```

Insert the shortcut button between the spacer `<div style={{ flex: 1 }} />` (line 59) and the settings gear (line 61):

```tsx
      <div style={{ flex: 1 }} />
      {/* AI Ecosystem shortcut — design Observe.dc.html nav rail. Terminal >_
          glyph with a live status dot; jumps to Settings -> AI Ecosystem. */}
      <button className={styles.gear} title={eco.title} onClick={onOpenEcosystem}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5l6 5-6 5" /><path d="M12 19h8" />
        </svg>
        <span className={`${styles.ecoDot} ${styles['ecoDot_' + eco.state]}`} />
      </button>
      {/* settings gear — design line 69–71 */}
```

Note: the shortcut reuses the `.gear` class for hover/sizing; the dot is absolutely positioned inside it, so add `position: relative` to `.gear` in the next step.

- [ ] **Step 2: Add dot styles**

In `frontend/src/components/NavRail.module.css`, add `position: relative;` to the `.gear` rule (inside the block starting line 63), then append:

```css
/* AI Ecosystem shortcut status dot — fixed traffic-light semantics, not accent
   (accent is user-configurable, so it must not drive a green/amber/grey signal). */
.ecoDot {
  position: absolute;
  top: 5px;
  right: 5px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.ecoDot_ok { background: #34e0a1; box-shadow: 0 0 6px -1px #34e0a1; }
.ecoDot_update { background: #f5b340; box-shadow: 0 0 6px -1px #f5b340; }
.ecoDot_off { background: var(--tx-13); }
```

- [ ] **Step 3: Wire App.tsx**

In `frontend/src/App.tsx`:

3a. Add to the ecosystem imports from `./lib/ecosystem` (the `import type { EcoStatus }` line from Task 7 step 4b) — change it to also import the helpers:

```tsx
import { dotState, ecoTooltip } from './lib/ecosystem';
import type { EcoStatus } from './lib/ecosystem';
```

3b. Find the `<NavRail ... />` render (around line 627-631) and add the two new props:

```tsx
          <NavRail
            activeNav={activeNav}
            onPick={setActiveNav}
            onOpenSettings={() => setSettingsOpen(true)}
            eco={{
              state: ecoStatus ? dotState(ecoStatus.cli) : 'off',
              title: ecoStatus ? ecoTooltip(ecoStatus.cli) : 'openobserve-cli not installed',
            }}
            onOpenEcosystem={() => { setSettingsOpen(true); setSettingsTab('agent'); }}
          />
```

(Match the existing `activeNav`/`onPick` prop values already in place; only `eco` and `onOpenEcosystem` are new.)

- [ ] **Step 4: Build**

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npm run build`
Expected: build succeeds.

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add frontend/src/components/NavRail.tsx frontend/src/components/NavRail.module.css frontend/src/App.tsx
git commit -m "feat(ecosystem): nav-rail terminal shortcut with three-state status dot

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Integration test + full build + churn restore

**Files:**
- Create: `internal/ecosystem/integration_test.go`

**Interfaces:**
- Consumes: `newExecRunner`, `New`, `Service.Status` (all prior tasks).

- [ ] **Step 1: Write the integration test with stub executables**

Create `internal/ecosystem/integration_test.go`:

```go
package ecosystem

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

// writeStub creates an executable shell script at dir/name.
func writeStub(t *testing.T, dir, name, body string) {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+body+"\n"), 0o755); err != nil {
		t.Fatal(err)
	}
}

// TestStatusWithRealExec puts stub `npm` and `openobserve-cli` on a temp PATH and
// verifies the Service classifies an npm-managed, updatable install correctly
// through real process execution.
func TestStatusWithRealExec(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("stub scripts are sh-based; not run on Windows")
	}
	dir := t.TempDir()
	writeStub(t, dir, "openobserve-cli", `
case "$1 $2" in
  "version ") echo "openobserve-cli v0.5.0 (commit abc, built x)" ;;
  "skill status") echo '{"embedded_version":"0.2.0","installs":[{"agent":"claude-code","status":"installed"}]}' ;;
esac`)
	writeStub(t, dir, "npm", `echo '{"dependencies":{"@angelmsger/openobserve-cli":{"version":"0.5.0"}}}'`)

	r := &execRunner{pathEnv: dir}
	s := New(r, func(context.Context) (string, error) { return "0.6.0", nil })
	st, err := s.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !st.CLI.Installed || st.CLI.Version != "0.5.0" {
		t.Errorf("cli = %+v", st.CLI)
	}
	if st.CLI.Managed != "npm" {
		t.Errorf("managed = %q, want npm", st.CLI.Managed)
	}
	if !st.CLI.UpdateAvailable {
		t.Error("expected update available (0.5.0 -> 0.6.0)")
	}
	if !st.Skill.Installed || len(st.Skill.Agents) != 1 {
		t.Errorf("skill = %+v", st.Skill)
	}
}

// TestStatusNotInstalledRealExec verifies an empty PATH yields a clean
// not-installed status without error.
func TestStatusNotInstalledRealExec(t *testing.T) {
	r := &execRunner{pathEnv: t.TempDir()}
	s := New(r, func(context.Context) (string, error) { return "0.6.0", nil })
	st, err := s.Status(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if st.CLI.Installed || st.NpmAvailable {
		t.Errorf("expected nothing installed, got %+v", st)
	}
}
```

- [ ] **Step 2: Run the integration test**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./internal/ecosystem/ -run RealExec -v`
Expected: PASS (2 tests).

- [ ] **Step 3: Full Go + frontend test sweep**

Run: `cd /Users/angelmsger/Development/Workspaces/o3 && go test ./...`
Expected: PASS (all packages).

Run: `cd /Users/angelmsger/Development/Workspaces/o3/frontend && npx vitest run`
Expected: PASS (all suites).

- [ ] **Step 4: Full app build + churn restore**

Run:
```bash
cd /Users/angelmsger/Development/Workspaces/o3
wails build
git checkout -- frontend/wailsjs/runtime/ go.mod go.sum
```
Expected: `wails build` exits 0.

Verify the sibling repo is untouched and no `go work sync` ran:

Run: `cd /Users/angelmsger/Development/Workspaces/oa-cli/src/openobserve-cli && git status --short`
Expected: empty (no changes to oa-cli).

- [ ] **Step 5: Commit**

```bash
cd /Users/angelmsger/Development/Workspaces/o3
git add internal/ecosystem/integration_test.go
git commit -m "test(ecosystem): integration test with stub npm + CLI on temp PATH

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Manual verification (after Task 9)

Run `wails dev` on macOS and confirm:
1. CLI absent -> AI Ecosystem tab shows "Not installed", nav-rail dot grey, tooltip "openobserve-cli not installed". If npm is present, Install runs and the tab flips to Installed (dot green). If npm is absent, the CLI card shows an "Install docs" button instead.
2. Older CLI present -> dot amber, pill "Update available", Upgrade button runs `npm install -g @angelmsger/openobserve-cli@latest`.
3. `go install`-ed CLI -> pill "Installed - external", no npm Upgrade/Uninstall (Manage via docs), and the external hint is shown.
4. Skill card: Install runs `openobserve-cli skill install`, "Deployed to" chips list the detected agents; Uninstall removes it. When the CLI is absent, the card shows "Install openobserve-cli first".
5. Nav-rail `>_` shortcut (above the gear) opens Settings on the AI Ecosystem tab.
6. Launched from Finder (not a terminal), detection still finds npm + the CLI (PATH resolution works).

## Deferred (per spec, not built here)

- "Configure openobserve-cli for this context" action (writing the CLI's context config so the agent is query-ready immediately).
- Streaming install progress (v1 shows a busy spinner + final result).
