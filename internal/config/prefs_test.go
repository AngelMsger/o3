package config

import (
	"os"
	"path/filepath"
	"testing"
)

// writeRawPrefs writes raw JSON directly to prefs.json in dir, bypassing
// savePrefsTo, so tests can exercise loadPrefsFrom against arbitrary/partial
// or invalid content.
func writeRawPrefs(dir, json string) error {
	return os.WriteFile(filepath.Join(dir, "prefs.json"), []byte(json), 0o600)
}

func TestLoadPrefsDefaultsWhenMissing(t *testing.T) {
	dir := t.TempDir()
	p, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if p.Theme != "dark" || p.Accent != "#2dd4bf" || p.Density != "ultra" {
		t.Fatalf("want defaults, got %+v", p)
	}
}

func TestSaveLoadRoundTrip(t *testing.T) {
	dir := t.TempDir()
	want := Prefs{
		Theme: "system", Accent: "#7c83ff", Density: "cozy",
		UpdateCheck: "off", SkipVersion: "1.3.0", LastUpdateCheck: "2026-07-14T10:00:00Z",
	}
	if err := savePrefsTo(dir, want); err != nil {
		t.Fatal(err)
	}
	got, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("round-trip: want %+v got %+v", want, got)
	}
}

func TestLoadPrefsIgnoresUnknownKeysAndFillsDefaults(t *testing.T) {
	dir := t.TempDir()
	// a partial file with an unknown key and a missing field
	if err := writeRawPrefs(dir, `{"theme":"light","extra":"ignored"}`); err != nil {
		t.Fatal(err)
	}
	got, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.Theme != "light" || got.Accent != "#2dd4bf" || got.Density != "ultra" {
		t.Fatalf("want theme=light + defaults for the rest, got %+v", got)
	}
}

func TestLoadPrefsInvalidThemeFallsBackToDark(t *testing.T) {
	dir := t.TempDir()
	if err := writeRawPrefs(dir, `{"theme":"neon"}`); err != nil {
		t.Fatal(err)
	}
	got, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.Theme != "dark" {
		t.Fatalf("invalid theme should fall back to dark, got %q", got.Theme)
	}
}

// A prefs.json written before the update fields existed must load with the check
// enabled — the whole reason UpdateCheck is a string and not a bool.
func TestLoadPrefsUpdateCheckDefaultsToAuto(t *testing.T) {
	dir := t.TempDir()
	if err := writeRawPrefs(dir, `{"theme":"light"}`); err != nil {
		t.Fatal(err)
	}
	got, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.UpdateCheck != "auto" {
		t.Fatalf("UpdateCheck = %q, want auto", got.UpdateCheck)
	}
	// An empty SkipVersion / LastUpdateCheck is meaningful ("none" / "never"),
	// so applyDefaults must leave them alone.
	if got.SkipVersion != "" || got.LastUpdateCheck != "" {
		t.Fatalf("want empty skip/last-check, got %+v", got)
	}
}

func TestLoadPrefsInvalidUpdateCheckFallsBackToAuto(t *testing.T) {
	dir := t.TempDir()
	if err := writeRawPrefs(dir, `{"updateCheck":"sometimes"}`); err != nil {
		t.Fatal(err)
	}
	got, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got.UpdateCheck != "auto" {
		t.Fatalf("UpdateCheck = %q, want auto", got.UpdateCheck)
	}
}

func TestMutatePrefsPreservesUntouchedFields(t *testing.T) {
	dir := t.TempDir()
	start := Prefs{
		Theme: "light", Accent: "#ff0000", Density: "cozy",
		UpdateCheck: "off", SkipVersion: "1.3.0", LastUpdateCheck: "2026-07-14T10:00:00Z",
	}
	if err := savePrefsTo(dir, start); err != nil {
		t.Fatal(err)
	}

	if err := mutatePrefsIn(dir, func(p *Prefs) { p.SkipVersion = "1.4.0" }); err != nil {
		t.Fatal(err)
	}
	got, err := loadPrefsFrom(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := start
	want.SkipVersion = "1.4.0"
	if got != want {
		t.Fatalf("mutate: want %+v got %+v", want, got)
	}
}
