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
