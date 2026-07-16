package config

import (
	"encoding/json"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
)

// Prefs holds o3-owned UI preferences (theme, accent color, row density).
// This is deliberately separate from the shared openobserve-cli config,
// which stores connection contexts; Prefs lives in its own file under o3's
// own config directory and is never read or written by the CLI.
type Prefs struct {
	Theme   string `json:"theme"`
	Accent  string `json:"accent"`
	Density string `json:"density"`

	// UpdateCheck is "auto" (the default) or "off". It is a string rather than a
	// bool because applyDefaults backfills empty fields, and encoding/json cannot
	// distinguish a missing bool from an explicit false — so a bool that defaults
	// to true has no representation here.
	UpdateCheck string `json:"updateCheck"`
	// SkipVersion is a release the user chose never to be told about again; ""
	// means none. Empty is meaningful, so applyDefaults must not touch it.
	SkipVersion string `json:"skipVersion"`
	// LastUpdateCheck is when the background check last succeeded (RFC3339); ""
	// means never. Empty is meaningful, so applyDefaults must not touch it.
	LastUpdateCheck string `json:"lastUpdateCheck"`
}

// prefsFileName is the file name for the persisted prefs, relative to o3's
// config directory.
const prefsFileName = "prefs.json"

// defaultPrefs returns the built-in defaults, kept in one place so both the
// missing-file case and the field-backfill case agree.
func defaultPrefs() Prefs {
	return Prefs{Theme: "dark", Accent: "#2dd4bf", Density: "ultra", UpdateCheck: "auto"}
}

// validThemes are the only accepted values for Prefs.Theme.
var validThemes = map[string]bool{"light": true, "dark": true, "system": true}

// validUpdateChecks are the only accepted values for Prefs.UpdateCheck.
var validUpdateChecks = map[string]bool{"auto": true, "off": true}

// applyDefaults fills any empty/invalid field of p with the default value,
// and normalizes an unrecognized Theme to "dark".
func applyDefaults(p Prefs) Prefs {
	d := defaultPrefs()
	if p.Theme == "" || !validThemes[p.Theme] {
		p.Theme = d.Theme
	}
	if p.Accent == "" {
		p.Accent = d.Accent
	}
	if p.Density == "" {
		p.Density = d.Density
	}
	if p.UpdateCheck == "" || !validUpdateChecks[p.UpdateCheck] {
		p.UpdateCheck = d.UpdateCheck
	}
	return p
}

// loadPrefsFrom reads prefs.json from dir. A missing file is not an error: it
// yields the full defaults. Any present file has defaults backfilled for
// empty fields, and an invalid Theme falls back to "dark".
func loadPrefsFrom(dir string) (Prefs, error) {
	data, err := os.ReadFile(filepath.Join(dir, prefsFileName))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return defaultPrefs(), nil
		}
		return Prefs{}, err
	}
	var p Prefs
	if err := json.Unmarshal(data, &p); err != nil {
		return Prefs{}, err
	}
	return applyDefaults(p), nil
}

// savePrefsTo writes p to prefs.json in dir, creating dir if needed. The
// write is atomic: it writes to a temp file in the same directory, then
// renames it over the target, so a crash mid-write never leaves a truncated
// prefs.json.
func savePrefsTo(dir string, p Prefs) error {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(p)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, prefsFileName+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Chmod(tmpPath, 0o600); err != nil {
		os.Remove(tmpPath)
		return err
	}
	if err := os.Rename(tmpPath, filepath.Join(dir, prefsFileName)); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return nil
}

// prefsDir resolves o3's own config directory: <os.UserConfigDir()>/o3.
func prefsDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "o3"), nil
}

// LoadPrefs loads the persisted UI preferences, falling back to defaults
// when no prefs file exists yet.
func LoadPrefs() (Prefs, error) {
	dir, err := prefsDir()
	if err != nil {
		return Prefs{}, err
	}
	return loadPrefsFrom(dir)
}

// mutatePrefsIn applies fn to the prefs stored in dir and writes the result back.
func mutatePrefsIn(dir string, fn func(*Prefs)) error {
	p, err := loadPrefsFrom(dir)
	if err != nil {
		return err
	}
	fn(&p)
	return savePrefsTo(dir, applyDefaults(p))
}

// MutatePrefs applies fn to the persisted prefs and saves the result.
//
// This is the only write path. Callers that own only some of the fields must use
// it rather than a load/save pair of their own: writing the whole struct back
// silently resets every field the caller did not populate.
// Serialize concurrent callers yourself — this is a read-modify-write.
func MutatePrefs(fn func(*Prefs)) error {
	dir, err := prefsDir()
	if err != nil {
		return err
	}
	return mutatePrefsIn(dir, fn)
}
