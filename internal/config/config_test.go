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
