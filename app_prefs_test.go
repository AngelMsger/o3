package main

import (
	"context"
	"testing"

	"github.com/angelmsger/o3/internal/config"
)

// newPrefsApp isolates the prefs file (via $HOME / $XDG_CONFIG_HOME, the two
// inputs to os.UserConfigDir) so the prefs methods never touch the real config.
func newPrefsApp(t *testing.T) *App {
	t.Helper()
	t.Setenv("HOME", t.TempDir())
	t.Setenv("XDG_CONFIG_HOME", t.TempDir())
	return &App{ctx: context.Background()}
}

func TestSetLastStreamRemembersPerContext(t *testing.T) {
	a := newPrefsApp(t)

	if err := a.SetLastStream("prod", "nginx_access"); err != nil {
		t.Fatalf("SetLastStream() error = %v", err)
	}
	if err := a.SetLastStream("staging", "app_logs"); err != nil {
		t.Fatalf("SetLastStream() error = %v", err)
	}

	got, err := a.GetPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if got.LastStreams["prod"] != "nginx_access" {
		t.Fatalf("prod = %q, want nginx_access", got.LastStreams["prod"])
	}
	if got.LastStreams["staging"] != "app_logs" {
		t.Fatalf("staging = %q, want app_logs", got.LastStreams["staging"])
	}

	// Re-picking in a context overwrites only that context's entry.
	if err := a.SetLastStream("prod", "audit"); err != nil {
		t.Fatalf("SetLastStream() error = %v", err)
	}
	got, err = a.GetPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if got.LastStreams["prod"] != "audit" || got.LastStreams["staging"] != "app_logs" {
		t.Fatalf("after re-pick: %v", got.LastStreams)
	}
}

// A theme save must not wipe the remembered streams: SavePrefs sends only the
// UI-owned fields, and the merge in App.SavePrefs is what keeps the rest.
func TestSavePrefsPreservesLastStreams(t *testing.T) {
	a := newPrefsApp(t)
	if err := a.SetLastStream("prod", "nginx_access"); err != nil {
		t.Fatal(err)
	}

	if err := a.SavePrefs(config.Prefs{Theme: "light", Accent: "#ff0000", Density: "cozy"}); err != nil {
		t.Fatalf("SavePrefs() error = %v", err)
	}

	got, err := a.GetPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if got.LastStreams["prod"] != "nginx_access" {
		t.Fatalf("LastStreams lost across SavePrefs: %v", got.LastStreams)
	}
	if got.Theme != "light" {
		t.Fatalf("Theme = %q, want light", got.Theme)
	}
}

// An empty context name has no meaningful key to write under, and an empty
// stream is not a selection — both are dropped rather than stored.
func TestSetLastStreamIgnoresEmptyArguments(t *testing.T) {
	a := newPrefsApp(t)

	if err := a.SetLastStream("", "nginx_access"); err != nil {
		t.Fatalf("SetLastStream() error = %v", err)
	}
	if err := a.SetLastStream("prod", ""); err != nil {
		t.Fatalf("SetLastStream() error = %v", err)
	}

	got, err := a.GetPrefs()
	if err != nil {
		t.Fatal(err)
	}
	if len(got.LastStreams) != 0 {
		t.Fatalf("want nothing stored, got %v", got.LastStreams)
	}
}
