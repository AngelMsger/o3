package ecosystem

import (
	"context"
	"errors"
	"strings"
	"testing"
)

// fakeRunner returns canned output keyed by the first arg (or name for lookups).
type fakeRunner struct {
	present map[string]string // name -> resolved path (LookPath)
	out     map[string]string // key -> stdout
	errs    map[string]error  // key -> err
	calls   []string          // recorded "name arg0 arg1 ..."
}

func key(name string, args ...string) string {
	return strings.TrimSpace(name + " " + strings.Join(args, " "))
}

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
			"openobserve-cli version":      "openobserve-cli v0.5.0 (commit abc, built x)",
			"npm ls":                       `{"dependencies":{"@angelmsger/openobserve-cli":{"version":"0.5.0"}}}`,
			"openobserve-cli skill status": `{"embedded_version":"0.2.0","installs":[{"agent":"claude-code","status":"installed"}]}`,
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
